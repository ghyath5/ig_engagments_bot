import { Client } from "../client";
import { Redis } from "../redis";
import { adminId, bot } from "../global";
import { PrismaClient } from '.prisma/client';
import i18n from "../locales";
// import { Memory } from "../memory";
const prisma = new PrismaClient()
bot.use(async (ctx,next)=>{
    if(!ctx.from?.id || ctx.from.is_bot)return;
    if(!parseInt(process.env.STATUS!) && !['1781740355',adminId].includes(ctx.from.id.toString())){
        return ctx.replyWithHTML("Under maintenance... Try again later").catch((e)=>{});
    }
    ctx.pk = ctx.from.id;
    ctx.i18n = i18n;
    const redis = new Redis(ctx.pk);
    ctx.lang = await redis.getLocale();
    ctx.i18n.setLocale(ctx.lang||'en');
    ctx.self = new Client(ctx.pk,ctx.lang,ctx);
    ctx.prisma = prisma;
    // ctx.memory = new Memory(ctx.from!.id);
    next();
})