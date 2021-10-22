import { Client } from "../client";
import { Redis } from "../redis";
import { bot } from "../global";
import { PrismaClient } from '@prisma/client';
import i18n from "../locales";
const prisma = new PrismaClient()
bot.use(async (ctx,next)=>{
    if(!Boolean(process.env.STATUS)){
        return ctx.replyWithHTML("تمت جميع عملياتك اليوم, حاول غداً");
    }
    if(!ctx.from?.id || ctx.from.is_bot)return;
    ctx.pk = ctx.from.id;
    ctx.i18n = i18n;
    const redis = new Redis(ctx.pk);
    ctx.lang = await redis.getLocale();
    ctx.i18n.setLocale(ctx.lang||'en');
    ctx.self = new Client(ctx.pk,ctx.lang,ctx);
    ctx.prisma = prisma;
    next();
})