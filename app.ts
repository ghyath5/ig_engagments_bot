import dotenv from 'dotenv';
dotenv.config();
import { adminId, bot, IG } from './global';
import './middlewares/onStart'
// import './schedular'
import fastify from 'fastify';
import telegrafPlugin from 'fastify-telegraf'
import { multipleNotification } from './utls';
const app = fastify({ logger: false, });
const WEBHOOK_URL = process.env.WEBHOOK_URL!;
const WEBHOOK_PATH = process.env.WEBHOOK_PATH!;
import { proxyManager } from './proxy-manager';
import { Client } from './client';
import { LocationPrivacy, PrismaClient } from '.prisma/client';
const prisma = new PrismaClient()
bot.start(async (ctx) => {
  let splited = ctx.message?.text?.split(' ');
  if (splited.length == 2 && !isNaN(Number(splited[1]))) {
    ctx.self.enterByLink(splited[1]);
  }
  if (!ctx.lang) {
    return ctx.self.translate('startupmsg').send(ctx.self.keyboard.langagues());
  }
  return ctx.self.sendHomeMsg();
})

bot.action('howwork', (ctx) => {
  return ctx.editMessageText(ctx.self.translate('howdoesworks').msg, { parse_mode: "HTML" }).catch(() => { })
})
bot.action('showtools', (ctx) => {
  return ctx.editMessageText(ctx.self.translate('tools').msg, { ...ctx.self.keyboard.tools(), parse_mode: "HTML" }).catch(() => { })
})
bot.action('detectunfollowers', async (ctx) => {
  return ctx.editMessageText(ctx.self.translate('unfollowtool').msg, { ...ctx.self.keyboard.startToolBtn('detectUnfollowers'), parse_mode: "HTML" }).catch(() => { })
})

bot.action(/starttool-(.+)/, async (ctx) => {
  let checkedToday = await ctx.self.redis.get('checkunfollowers');
  if (checkedToday) return ctx.self.translate('youcheckedtoday').send();
  let tool = ctx.match['input'].split('-')[1];
  if (tool == 'detectUnfollowers') {
    if (!await ctx.self.hasSuffecientGems(5)) {
      return ctx.editMessageText(ctx.self.translate('noenoughgems').msg, { parse_mode: "HTML" }).catch(() => { })
    }
    if (ctx.self.memory.get('checking')) {
      return;
    }
    // ctx.self.memory.set('checking', true);
    // if(['428638891','1781740355','607072328',adminId].includes(ctx.from!.id.toString())){
    // ctx.deleteMessage().catch(() => { });
    // return ctx.self.whoUnfollowMe();
    // }
    return ctx.replyWithHTML("<b>Comming soon.</b>").catch(() => { });
  }
})

bot.action(/setlang-(.+)/, async (ctx) => {
  let lang = ctx.match['input'].split('-')[1]
  ctx.deleteMessage().catch(() => { });;
  ctx.self.setLang(lang);
  ctx.self.translate("langChanged").send();
  ctx.self.sendHomeMsg();
})


bot.action('changelang', (ctx) => {
  return ctx.editMessageText(ctx.self.translate('startupmsg').msg, { ...ctx.self.keyboard.langagues() }).catch(() => { });
})
bot.action("showmyinsta", async (ctx) => {
  let username = await ctx.self.getUsername();
  ctx.deleteMessage().catch(() => { });;
  return ctx.self.getIGProfile(username);
})
bot.action('changeigprofile', (ctx) => {
  ctx.self.redis.set(`sendingusername`, 'true', { "EX": 60 * 2 })
  return ctx.self.translate(`sendUrUsername`).send();
})
bot.action('startfollowing', async (ctx) => {
  ctx.deleteMessage().catch(() => { });
  return ctx.self.sendUser()
})
bot.action('sendLink', async (ctx) => {
  return ctx.editMessageText(ctx.self.translate('sharebotdesc', { link: ctx.self.myLink() }).msg, { parse_mode: "HTML" }).catch(() => {
    return ctx.editMessageCaption(ctx.self.translate('sharebotdesc', { link: ctx.self.myLink() }).msg, { ...ctx.self.keyboard.changeProfileBtn(), parse_mode: "HTML" }).catch(() => { });;
  });
})
bot.action('sendusertofollow', async (ctx) => {
  ctx.answerCbQuery().catch(() => { });
  return ctx.self.sendUser()
})


bot.action(/rep-(.+)/, async (ctx) => {
  let reason = ctx.match['input'].split('-')[1];
  let username = ctx.match['input'].split('-')[2];
  await ctx.self.addAccountToSkipped(username);
  ctx.deleteMessage().catch(() => { });
  let igInstance = await IG.getInstance();
  let profile = await igInstance.checkProfile(username) as any;
  ctx.self.sendUser();
  if (!profile || profile.is_private) {
    bot.telegram.sendMessage(adminId, `Report about <a href="https://instagram.com/${username}">@${username}</a> ${reason}`, { parse_mode: "HTML" });
    let user = await ctx.prisma.account.update({ where: { username }, data: { active: false }, select: { owner: true } })
    if (!user?.owner) return
    let cl = new Client(user.owner.id);
    await cl.getLang()
    if (!profile) {
      return cl.translate('yourachidden').send()
    }
    return cl.translate('youracprivate').send()
  }
  bot.telegram.sendMessage(adminId, `Report about <a href="https://instagram.com/${username}">@${username}</a> ${reason} but not deleted!`, { parse_mode: "HTML" });
  let reports = parseInt(await ctx.self.redis.get('fake-reports') || "0")
  if (!reports) {
    await ctx.self.redis.set('fake-reports', "0", { "EX": 60 * 10 })
  }
  ctx.self.redis.client.incr(`${ctx.from!.id}:fake-reports`);
})
bot.action(/report-(.+)/, async (ctx) => {
  let reports = parseInt(await ctx.self.redis.get('fake-reports') || "0")
  if (reports >= 3) {
    return ctx.replyWithHTML("Don't spam bro");
  }
  let username = ctx.match['input'].split('-')[1];
  // let profile = await igInstance.checkProfile(username) as any;
  // if(profile.is_private){
  //   return ctx.prisma.user.update({where:{igUsername:username},data:{active:false}})
  // }
  return ctx.editMessageText(ctx.self.translate('reportdesc').msg, ctx.self.keyboard.reportBtns(username)).catch(() => { });

})
bot.action(/followed-(.+)/, async (ctx) => {
  let username = ctx.match['input'].split('-')[1];
  if (ctx.self.memory.get('followedUsername') && ctx.self.memory.get('followed') == username) {
    return;
  }
  ctx.self.memory.set('followedUsername', username);
  let fakefollows = parseInt(await ctx.self.redis.get(`fakefollows`) || "0")
  if (fakefollows >= 4) {
    ctx.self.memory.set('followedUsername', null);
    return ctx.self.translate('youspamfollow').send()
  }
  let hourlyfollows = parseInt(await ctx.self.redis.get('hourlyfollows') || "0")
  if ((hourlyfollows >= 25) && adminId != ctx.from!.id.toString()) {
    ctx.self.memory.set('followedUsername', null);
    return ctx.self.translate('followedexcedded').send();
  }
  let [followedAccounts, skippedAccounts] = await Promise.all([
    ctx.self.followedAccounts(),
    ctx.self.accountSkipped()
  ]);
  if (skippedAccounts.includes(username) || followedAccounts.includes(username)) {
    ctx.deleteMessage().catch(() => { });
    return ctx.self.sendUser();
  }
  let execludes = ctx.self.memory.get<string[]>('execludes') || [];
  if (execludes.includes(username)) return ctx.self.sendUser();
  ctx.self.memory.push('execludes', username);
  await ctx.self.checkIfollowed(username)
  ctx.deleteMessage().catch(() => { });
  await IG.sleep(3000, 5000);
  await ctx.self.sendUser();
  ctx.self.memory.set('followedUsername', null);
})

bot.action(/skip-(.+)/, async (ctx) => {
  let username = ctx.match['input'].split('-')[1]
  await ctx.self.addAccountToSkipped(username);
  ctx.deleteMessage().catch(() => { });
  return ctx.self.sendUser()
})
bot.action(/findme-(.+)/, async (ctx) => {
  let find = ctx.match['input'].split('-')[1] as LocationPrivacy
  let updated = await prisma.user.update({ where: { id: Number(ctx.pk) }, data: { loc_privacy: find } })
  ctx.answerCbQuery().catch(() => { });
  return ctx.editMessageText(ctx.self.translate(`privacy-${find}`).msg, { ...ctx.self.keyboard.locationOptions(updated.loc_privacy), parse_mode: "HTML" }).catch(() => { });
})
bot.action('set_location', (ctx) => {
  return ctx.self.translate('specifyLocation').send(ctx.self.keyboard.locationBtn())
})
bot.command('proxies', async (ctx) => {
  if (ctx.from.id.toString() != adminId) return;
  return ctx.replyWithHTML(`All Proxies: ${proxyManager.working.length}`).catch(() => { });
})
bot.command('promote', async (ctx) => {
  if (ctx.from.id.toString() != adminId) return;
  let me = await ctx.self.account()
  let allUsers = await ctx.prisma.account.findMany({
    where: {
      main: true,
      user_id: { not: 94974028 },
      username: { not: "joood9516" },
      follows: {
        none: {
          followed_id: { equals: me.igId }
        }
      },
    }
  });
  let ids = allUsers.map((u) => u.user_id);
  multipleNotification(ids, (client) => {
    client.translate('followdeveloper').send({
      ...client.keyboard.inlineKeyboard([[{ text: client.translate('followed').msg, callback_data: `followed-ghyathdarwish` }]])
    })
  })
})
bot.command('s_g_m', async (ctx) => {
  if (ctx.from.id.toString() != adminId) return;
  let allUsers = await ctx.prisma.user.findMany({
    where: {
      gems: {
        lte: 2
      }
    }
  });
  let ids = allUsers.map((u) => u.id);
  multipleNotification(ids, (client) => {
    client.translate('younotreceivefollows').send({ ...client.keyboard.earnGemsBtn() });
  })
})
bot.command('notify', async (ctx) => {
  if (ctx.from.id.toString() != adminId) return;
  let allUsers = await ctx.prisma.user.findMany({ where: { active: true } });
  let ids = allUsers.map((u) => u.id);
  multipleNotification(ids, (client) => {
    client.translate('notificationIssueMsg').send()
  })
})
bot.command('w_s', async (ctx) => {
  if (ctx.from.id.toString() != adminId) return;
  let allUsers = await ctx.prisma.user.findMany({ where: { active: true } });
  let ids = allUsers.map((u) => u.id);
  multipleNotification(ids, (client) => {
    client.translate('showthisaccount').send()
  })
})
bot.command('set_location', async (ctx) => {
  if (ctx.from.id.toString() != adminId) return;
  let allUsers = await ctx.self.userRaw.getUsersHaveNoLocation();
  let ids = allUsers?.map((u) => u.id);
  if (!ids) return;
  ctx.reply(`Seding to ${ids.length}`)
  multipleNotification(ids, async (client) => {
    client.translate('specifyLocation').send(client.keyboard.locationBtn())
  })
})
bot.command('share_links', async (ctx) => {
  if (ctx.from.id.toString() != adminId) return;
  let allUsers = await ctx.prisma.user.findMany({ where: { active: true } });
  let ids = allUsers.map((u) => u.id);
  multipleNotification(ids, (client) => {
    client.translate('sharebotdesc', { link: client.myLink() }).send()
  })
})
bot.command('post', async (ctx) => {
  if (ctx.from.id.toString() != adminId) return;
  const ig = new IG();
  await ig.login()
  ctx.reply(`${ig.username} is uploading an image...`)

  await ig.post()
  return ctx.reply("Posted");
})
// bot.command('f_ig',async (ctx)=>{
//   if(ctx.from.id.toString() != adminId)return;
//   let allUsers = await ctx.prisma.user.findMany();
//   let ids = allUsers.map((u)=>u.id);
//   multipleNotification(ids,(client)=>{})
// })
bot.command('start_following', (ctx) => {
  return ctx.self.sendUser();
})
bot.command('profile', async (ctx) => {
  let username = await ctx.self.getUsername();
  ctx.deleteMessage().catch(() => { });;
  ctx.self.getIGProfile(username);
})
bot.command('language', (ctx) => {
  return ctx.self.translate('selectLanguage').send(ctx.self.keyboard.langagues());
})
bot.on('location', (ctx) => {
  return ctx.self.setLocation(ctx.message.location);
})
bot.on('text', async (ctx) => {
  let msg = ctx.message.text;
  if (!await ctx.self.redis.get('sendingusername')) {
    return ctx.self.sendHomeMsg();
  }
  let changed = await ctx.self.redis.get('recentlyadded');
  if (changed) return ctx.self.sendMessage("لا يمكنك تغيير الحساب اليوم", { ...ctx.self.keyboard.home() });
  if (/^(?!.*\.\.)(?!.*\.$)[^\W][\w.]{0,29}$/.test(msg)) {
    return ctx.self.register(msg, ctx)
  }
  let linkRE = /(?:(?:http|https):\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/([A-Za-z0-9-_\.]+)/igm;
  let allMatched = msg.match(linkRE);
  if (allMatched?.length) {
    let link = allMatched[0];
    let username = link.split('/')[link.split('/').length - 1];
    if (username) {
      return ctx.self.register(username, ctx)
    }
  }

  return ctx.self.translate('usernamewrong').send();
})
app.register(telegrafPlugin, { bot, path: WEBHOOK_PATH })
bot.telegram.setWebhook(WEBHOOK_URL + WEBHOOK_PATH).then(() => {
  console.log('Webhook is set on', WEBHOOK_URL)
})
if (process.env.DEV) {
  console.log('Dev start');

  bot.launch()
}

app.listen(process.env.PORT!, '0.0.0.0')
