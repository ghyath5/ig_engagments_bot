import dotenv from 'dotenv';
dotenv.config();
import { adminId, bot,IG } from './global';
import './middlewares/onStart'
import fastify from 'fastify';
import telegrafPlugin from 'fastify-telegraf'
import { igInstance } from './instagram';
const app = fastify({ logger: false, });

const WEBHOOK_URL = process.env.WEBHOOK_URL!;
const WEBHOOK_PATH = process.env.WEBHOOK_PATH!;

bot.start(async (ctx) => {
  if (!ctx.lang) {
    return ctx.self.translate('startupmsg').send(ctx.self.keyboard.langagues());
  }
  return ctx.self.sendHomeMsg();
})

bot.action('howwork',(ctx)=>{
  return ctx.editMessageText(ctx.self.translate('howdoesworks').msg,{parse_mode:"HTML"})
})

bot.action(/setlang-(.+)/, async (ctx) => {
  let lang = ctx.match['input'].split('-')[1]
  ctx.deleteMessage();
  ctx.self.setLang(lang);
  ctx.self.translate("langChanged").send();
  ctx.self.sendHomeMsg();
})


bot.action('changelang', (ctx) => {
  return ctx.editMessageText(ctx.self.translate('startupmsg').msg, { ...ctx.self.keyboard.langagues() })
})
bot.action("showmyinsta", async (ctx) => {
  let username = await ctx.self.getUsername();
  ctx.deleteMessage();
  return ctx.self.getIGProfile(username);
})
bot.action('changeigprofile',(ctx)=>{
  ctx.self.redis.set(`sendingusername`,'true',{"EX":60*2})
  return ctx.self.translate(`sendUrUsername`).send();
})
bot.action('startfollowing', async (ctx) => {
  ctx.deleteMessage();
  return ctx.self.sendUser()
})
bot.action('sendusertofollow', async (ctx) => {
  return ctx.self.sendUser()
})


bot.action(/followed-(.+)/, async (ctx) => {
  let username = ctx.match['input'].split('-')[1]
  let todayfollowed = parseInt(await ctx.self.redis.get('todayfollowed')||"0")
  if(todayfollowed >= 25){
    return ctx.self.translate('followedexcedded').send();
  }
  if(!todayfollowed){
    ctx.self.redis.set('todayfollowed',"0",{"EX":60*60*1})
  }
  ctx.self.redis.client.incr(`${ctx.from!.id}:todayfollowed`);
  // if(ctx.session.wating)return;
  // if(ctx.session.recentlyFollowed == username)return;
  // ctx.session.wating = true;
  // ctx.session.recentlyFollowed = username;
  let [followedAccounts,skippedAccounts] = await Promise.all([
    ctx.self.followedAccounts(),
    ctx.self.accountSkipped()
  ]);
  if(skippedAccounts.includes(username) || followedAccounts.includes(username)){
    ctx.deleteMessage();
    return ctx.self.sendUser();
  }
  let me = await ctx.self.profile();
  // const user = await igInstance.checkProfile(myUsername) as any;
  // if (!user) {
  //   return ;
  // }
  await ctx.self.checkIfollowed(username,me!)
  ctx.deleteMessage();
  await IG.sleep(1000,3000);
  return ctx.self.sendUser();
})

bot.action(/skip-(.+)/,async (ctx)=>{
  let username = ctx.match['input'].split('-')[1]
  await ctx.self.addAccountToSkipped(username);
  ctx.deleteMessage();
  return ctx.self.sendUser()
})

bot.command('start_following',(ctx)=>{
  return ctx.self.sendUser();
})
bot.command('profile',async (ctx)=>{
  let username = await ctx.self.getUsername();
  ctx.deleteMessage();
  ctx.self.getIGProfile(username);
})
bot.command('language',(ctx)=>{
  return ctx.self.translate('selectLanguage').send(ctx.self.keyboard.langagues());
})
bot.on('text', async (ctx) => {
  let msg = ctx.message.text;
  if (!await ctx.self.redis.get('sendingusername')) {
    if(ctx.from.id.toString() == adminId && msg.match(/\d/g) && msg.includes(':')){
      let proxies:any = msg.replace(/\n/ig,'').split(",");
      let prxis = JSON.parse(await ctx.self.redis.client.get('proxies')||"[]");
      let ips = prxis.map((p)=>p.ip);
      proxies = proxies.map((proxy)=>{
        if(!proxy || ips.includes(proxy.ip))return;
        let host = proxy.split(':')
        if (host[0].match(/^\d/)) {
          return {ip:host[0],port:host[1]}
        }else{
          return {ip:host[1],port:host[2],type:host[0]}
        }
      }).filter((p)=>p)
      prxis = [...prxis,...proxies];
      ctx.self.redis.client.set('proxies',JSON.stringify(prxis));
    }
    return ctx.self.sendHomeMsg();
  }
  if (/^(?!.*\.\.)(?!.*\.$)[^\W][\w.]{0,29}$/.test(msg)) {
    let user = (await igInstance.checkProfile(msg) as any);
    if (!user?.id || user.is_private) {
      return ctx.self.translate('usernamewrong').send();
    }
    let saved = await ctx.self.save(msg,user.id);
    if(saved.linked){
      return ctx.replyWithPhoto({ url: user.profile_pic_url_hd }, {
        parse_mode: "HTML",
        caption: `${ctx.self.generateAccountLink(user.username)} ${ctx.self.translate("accountUpdated").msg}`,
        ...ctx.self.keyboard.home()
      }).catch((e)=>{})
    }
    return ctx.replyWithHTML(saved.message!).catch((e)=>{});
  }
  return ctx.self.translate('usernamewrong').send();
})
app.register(telegrafPlugin, { bot, path: WEBHOOK_PATH })

bot.telegram.setWebhook(WEBHOOK_URL + WEBHOOK_PATH).then(() => {
    console.log('Webhook is set on', WEBHOOK_URL)
})

app.listen(process.env.PORT!, '0.0.0.0')