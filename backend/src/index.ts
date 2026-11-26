import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
// Render runs behind a reverse proxy; trust its forwarded client IP for rate limiting.
app.set("trust proxy", 1);
const port = Number(process.env.PORT || 4000);
const key = process.env.HYPIXEL_API_KEY;
app.use(helmet());
app.use(express.json({ limit: "20kb" }));
app.use(cors({ origin: (origin, cb) => {
  const allow = (process.env.FRONTEND_ORIGIN || "").split(",").map(x => x.trim()).filter(Boolean);
  if (!origin || allow.length === 0 || allow.includes(origin)) return cb(null, true);
  cb(new Error("Origin not allowed"));
}}));
app.use("/api", rateLimit({windowMs:60000,limit:90,standardHeaders:true,legacyHeaders:false}));
class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
type CacheEntry<T>={expiresAt:number;value?:T;pending?:Promise<T>};
const cache=new Map<string,CacheEntry<any>>();
async function cached<T>(cacheKey:string,ttlMs:number,loader:()=>Promise<T>):Promise<T>{
  const now=Date.now(),existing=cache.get(cacheKey);
  if(existing&&existing.expiresAt>now){
    if(existing.pending)return existing.pending;
    return existing.value as T;
  }
  const entry:CacheEntry<T>={expiresAt:now+ttlMs};
  const pending=loader().then(value=>{entry.value=value;entry.pending=undefined;entry.expiresAt=Date.now()+ttlMs;return value;}).catch(error=>{cache.delete(cacheKey);throw error;});
  entry.pending=pending;cache.set(cacheKey,entry);return pending;
}

async function hypixel(path:string,ttlMs=120000) {
  return cached("hypixel:"+path,ttlMs,async()=>{
    if(!key) throw new ApiError(503,"Backend API key is not configured. Add HYPIXEL_API_KEY in Render.");
    const response=await fetch(new URL(path,"https://api.hypixel.net/"),{headers:{"API-Key":key}});
    const data=await response.json().catch(()=>({})) as any;
    if(!response.ok||data.success===false) throw new ApiError(response.status===429?429:502,response.status===429?"Hypixel API rate limit. Try again shortly.":String(data.cause||"Hypixel API request failed"));
    return data;
  });
}
async function uuid(name:string) {
  const clean=name.trim();
  if(!/^[a-zA-Z0-9_]{3,16}$/.test(clean)) throw new ApiError(400,"Enter a valid Minecraft username.");
  return cached("uuid:"+clean.toLowerCase(),600000,async()=>{
    const r=await fetch("https://api.mojang.com/users/profiles/minecraft/"+encodeURIComponent(clean));
    if(r.status===404) throw new ApiError(404,"Minecraft username not found.");
    if(!r.ok) throw new ApiError(502,"Mojang lookup is temporarily unavailable.");
    const d=await r.json() as {id?:string};
    if(!d.id) throw new ApiError(404,"Minecraft username not found.");
    return d.id;
  });
}
app.get("/api/health",(_req,res)=>res.json({ok:true,configured:Boolean(key)}));
app.get("/api/player/:username",async(req,res,next)=>{try{const id=await uuid(req.params.username);const d=await hypixel("player?uuid="+id,180000);res.json({uuid:id,player:d.player||null});}catch(e){next(e);}});
app.get("/api/skyblock/profiles/:username",async(req,res,next)=>{try{const id=await uuid(req.params.username);const d=await hypixel("skyblock/profiles?uuid="+id,180000);res.json({uuid:id,profiles:d.profiles||[]});}catch(e){next(e);}});
app.get("/api/skyblock/bazaar",async(_req,res,next)=>{try{const d=await hypixel("skyblock/bazaar",60000);res.json({products:d.products||{},lastUpdated:d.lastUpdated||null});}catch(e){next(e);}});
app.get("/api/skyblock/auctions",async(req,res,next)=>{try{const page=Math.max(0,Math.min(10000,Number(req.query.page||0)));res.json(await hypixel("skyblock/auctions?page="+page,45000));}catch(e){next(e);}});
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
app.use(express.static(frontendDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(frontendDist, "index.html"), err => { if (err) next(err); });
});
app.use((err:Error|ApiError,_req:Request,res:Response,_next:NextFunction)=>{const status=err instanceof ApiError?err.status:500;res.status(status).json({error:status===500?"Unexpected backend error":err.message});});
app.listen(port,()=>console.log("SkyTrack API listening on "+port));
