import { Telegraf } from "telegraf";
import LocalSession from "telegraf-session-local";
import { MyContext } from "./@types";
import IG from "./instagram";
const bot = new Telegraf<MyContext>(process.env.BOT_TOKEN!)
bot.use((new LocalSession({storage: LocalSession.storageMemory, property:'session' })).middleware())
export const randomItem = (items:any[])=>{
    return items[Math.floor(Math.random()*items.length)];
}
export {
    MyContext,
    IG,
    bot
}
