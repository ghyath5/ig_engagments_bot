import { Telegraf } from "telegraf";
import { MyContext } from "./@types";
import IG from "./instagram";
const bot = new Telegraf<MyContext>(process.env.BOT_TOKEN!)
export const randomItem = (items:any[])=>{
    return items[Math.floor(Math.random()*items.length)];
}
export {
    MyContext,
    IG,
    bot
}
