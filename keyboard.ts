
import { Markup } from "telegraf";
import { InlineKeyboardButton,KeyboardButton } from 'telegraf/typings/core/types/typegram';
import { Client } from "./client";
import { MyContext } from "./global";
import { langs } from "./locales";
// export const inlineKeyboard = (keyboards:Array<InlineKeyboardButton> = []) => Markup.inlineKeyboard(keyboards)

export class Keyboard {
    client:Client
    constructor(client:Client){
        this.client = client;
    }
    inlineKeyboard(buttons:any = []){
        return Markup.inlineKeyboard(buttons)
    }
    mainKeyboard(buttons:Array<KeyboardButton> = []){
        return Markup.keyboard(buttons).resize();
    }
    langagues(){
        let buttons:any = [];
        for(const [key,value] of Object.entries(langs)){
            buttons.push([{text:value,callback_data:`setlang-${key}`}])
        }
        return this.inlineKeyboard(buttons) 
    }
    changeProfileBtn() {
        let buttons:any = [
            [{text:this.client.translate('change').msg, callback_data:`changeigprofile`}],
        ];
        return this.inlineKeyboard(buttons)
    }
    home(){
        let buttons:any = [
            [{text:this.client.translate('startfollowbtn').msg, callback_data:`startfollowing`}],
            [{text:this.client.translate('myinstabtn').msg, callback_data:`showmyinsta`}],
            [{text:this.client.translate('changelang').msg, callback_data:`changelang`}],
            [{text:this.client.translate('howwork').msg, callback_data:`howwork`}],
            [{text:this.client.translate('sharebot').msg, callback_data:`sendLink`}]
        ];
        return this.inlineKeyboard(buttons)
    }
    panel(username: string){
        let buttons:any = [
            [{text:this.client.translate('followed').msg, callback_data:`followed-${username}`}],
            [{text:this.client.translate('report').msg, callback_data:`report-${username}`},
            {text:this.client.translate('skip').msg, callback_data:`skip-${username}`}],
        ];
        return this.inlineKeyboard(buttons)
    }
    reportBtns(username:string){
        let buttons:any = [
            [{text:this.client.translate('private').msg, callback_data:`rep-private-${username}`},
            {text:this.client.translate('notfound').msg, callback_data:`rep-notfound-${username}`}],
            [{text:this.client.translate('cancel').msg, callback_data:`startfollowing`}],
        ];
        return this.inlineKeyboard(buttons)
    }
    shareBot(){
        let buttons:any = [
            [{text:this.client.translate('sharebot').msg, callback_data:`sendLink`}]
        ];
        return this.inlineKeyboard(buttons)
    }
}
