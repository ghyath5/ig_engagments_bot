import dotenv from 'dotenv';
dotenv.config();
import { adminId, bot,IG } from './global';
import './middlewares/onStart'
import fastify from 'fastify';
import telegrafPlugin from 'fastify-telegraf'
import { igInstance } from './instagram';
import { multipleNotification } from './utls';
const app = fastify({ logger: false, });
const isPausedWorker = parseInt(process.env.PAUSE_WORKER||"0")
const WEBHOOK_URL = process.env.WEBHOOK_URL!;
const WEBHOOK_PATH = process.env.WEBHOOK_PATH!;

bot.start(async (ctx) => {
  let splited = ctx.message?.text?.split(' ');
  if(splited.length==2 && !isNaN(Number(splited[1]))){
    ctx.self.enterByLink(splited[1]);
  }
  if (!ctx.lang) {
    return ctx.self.translate('startupmsg').send(ctx.self.keyboard.langagues());
  }
  return ctx.self.sendHomeMsg();
})

bot.action('howwork',(ctx)=>{
  return ctx.editMessageText(ctx.self.translate('howdoesworks').msg,{parse_mode:"HTML"}).catch(()=>{})
})
bot.action('showtools',(ctx)=>{
  return ctx.editMessageText(ctx.self.translate('tools').msg,{...ctx.self.keyboard.tools(),parse_mode:"HTML"}).catch(()=>{})
})
bot.action('detectunfollowers',async(ctx)=>{
  return ctx.editMessageText(ctx.self.translate('unfollowtool').msg,{...ctx.self.keyboard.startToolBtn('detectUnfollowers'),parse_mode:"HTML"}).catch(()=>{})
})

bot.action(/starttool-(.+)/,async (ctx)=>{
  let checkedToday = await ctx.self.redis.get('checkunfollowers');
  if(checkedToday)return ctx.self.translate('youcheckedtoday').send();
  let tool = ctx.match['input'].split('-')[1];
  if(tool == 'detectUnfollowers'){
    if(!await ctx.self.hasSuffecientGems(5)){
      return ctx.editMessageText(ctx.self.translate('noenoughgems').msg,{parse_mode:"HTML"}).catch(()=>{})
    }
    if(['428638891','1781740355','607072328',adminId].includes(ctx.from!.id.toString())){
      ctx.self.redis.set('checkunfollowers','c',{'EX':60*60*24})
      ctx.deleteMessage();
      return ctx.self.whoUnfollowMe();
    }
    return ctx.replyWithHTML("<b>Comming soon.</b>").catch(()=>{});
  }
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
bot.action('sendLink', async (ctx) => {
    return ctx.editMessageText(ctx.self.translate('sharebotdesc',{link:ctx.self.myLink()}).msg,{parse_mode:"HTML"}).catch(()=>{
      return ctx.editMessageCaption(ctx.self.translate('sharebotdesc',{link:ctx.self.myLink()}).msg,{...ctx.self.keyboard.changeProfileBtn(),parse_mode:"HTML"});
    });
})
bot.action('sendusertofollow', async (ctx) => {
  return ctx.self.sendUser()
})


bot.action(/rep-(.+)/, async (ctx) => {
  let reason = ctx.match['input'].split('-')[1];
  let username = ctx.match['input'].split('-')[2];
  let profile = await igInstance.checkProfile(username) as any;
  ctx.deleteMessage();
  await ctx.self.addAccountToSkipped(username);
  ctx.self.sendUser();
  if(!profile || profile.is_private){
    bot.telegram.sendMessage(adminId,`Report about <a href="https://instagram.com/${username}">@${username}</a> ${reason}`,{parse_mode:"HTML"});
    return ctx.prisma.account.update({where:{username:username},data:{active:false}})
  }
  bot.telegram.sendMessage(adminId,`Report about <a href="https://instagram.com/${username}">@${username}</a> ${reason} but not deleted!`,{parse_mode:"HTML"});
  let reports = parseInt(await ctx.self.redis.get('fake-reports')||"0")
  if(!reports){
    await ctx.self.redis.set('fake-reports',"0",{"EX":60*10})
  }
  ctx.self.redis.client.incr(`${ctx.from!.id}:fake-reports`);
})
bot.action(/report-(.+)/, async (ctx) => {
  let reports = parseInt(await ctx.self.redis.get('fake-reports')||"0")
  if(reports >= 3){
    return ctx.replyWithHTML("Don't spam");
  }
  let username = ctx.match['input'].split('-')[1];
  // let profile = await igInstance.checkProfile(username) as any;
  // if(profile.is_private){
  //   return ctx.prisma.user.update({where:{igUsername:username},data:{active:false}})
  // }
  return ctx.editMessageText(ctx.self.translate('reportdesc').msg,ctx.self.keyboard.reportBtns(username))

})
let followAction = {};
bot.action(/followed-(.+)/, async (ctx) => {
  let username = ctx.match['input'].split('-')[1];
  if(followAction[ctx.from!.id] && followAction[ctx.from!.id] == username){  
    return;
  }
  followAction[ctx.from!.id] = username;
  let fakefollows = parseInt(await ctx.self.redis.get(`fakefollows`)||"0")
  if(fakefollows>=4){
    followAction[ctx.from!.id] = null;
    return ctx.self.translate('youspamfollow').send()
  }
  let todayfollowed = parseInt(await ctx.self.redis.get('todayfollowed')||"0")
  if(todayfollowed >= 25 || isPausedWorker){
    followAction[ctx.from!.id] = null;
    return ctx.self.translate('followedexcedded').send();
  }
  if(!todayfollowed){
    await ctx.self.redis.set('todayfollowed',"0",{"EX":60*60*1})
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
  // const user = await igInstance.checkProfile(myUsername) as any;
  // if (!user) {
  //   return ;
  // }
  await ctx.self.checkIfollowed(username)
  ctx.deleteMessage();
  await IG.sleep(1000,2000);
  return ctx.self.sendUser();
})

bot.action(/skip-(.+)/,async (ctx)=>{
  let username = ctx.match['input'].split('-')[1]
  await ctx.self.addAccountToSkipped(username);
  ctx.deleteMessage();
  return ctx.self.sendUser()
})

bot.command('s_g_m',async (ctx)=>{
  if(ctx.from.id.toString() !=  adminId)return;
  let allUsers = await ctx.prisma.user.findMany({
    where:{
      gems:{
        lte:2
      }
    }
  });
  let ids = allUsers.map((u)=>u.id);
  multipleNotification('younotreceivefollows',ids)
})
bot.command('f_ig',async (ctx)=>{
  if(ctx.from.id.toString() != adminId)return;
  let allUsers = await ctx.prisma.user.findMany();
  let ids = allUsers.map((u)=>u.id);
  multipleNotification('followOurIg',ids)
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
        let host = proxy.split(':')
        if(!proxy || ips.includes(host[0]))return;
        if (host[0].match(/^\d/)) {
          return {ip:host[0],port:host[1]}
        }
      }).filter((p)=>p)
      prxis = [...prxis,...proxies];
      ctx.self.redis.client.set('proxies',JSON.stringify(prxis));
    }
    return ctx.self.sendHomeMsg();
  }
  if (/^(?!.*\.\.)(?!.*\.$)[^\W][\w.]{0,29}$/.test(msg)) {
    let user = (await igInstance.checkProfile(msg) as any);
    if (!user?.id || user.is_private || user.is_verified) {
      return ctx.self.translate('usernamewrong').send();
    }
    let saved = await ctx.self.save(msg,user.id);
    ctx.self.redis.del('ig')
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
