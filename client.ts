import { adminId, bot, IG, MyContext, } from './global';
import { client, Redis } from './redis';
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import { PrismaClient, User } from '@prisma/client';
import { Keyboard } from './keyboard';
import Queue from 'bee-queue';
import { igInstance } from './instagram';
import i18n from "./locales";
import { I18n } from 'i18n';
import { notifyUnfollowers } from './utls';
const isPausedWorker = parseInt(process.env.PAUSE_WORKER||"0")

const queue = new Queue('following',{
    removeOnSuccess:true,
    redis:{
        url:process.env.DB_REDIS_URL
    },
    isWorker:!isPausedWorker
});
const prisma = new PrismaClient()
const credentials = [
    {
        username:process.env.IG_USERNAME!,
        password:process.env.IG_PASSWORD!,
    },
    {
        username:process.env.IG2_USERNAME!,
        password:process.env.IG2_PASSWORD!
    }
]
let index = 1;
const getCredentials = ()=>{
    index = index == 0?1:0;
    return credentials[index]
}
export class Client {
    async enterByLink(id) {
        if(id == this.pk)return;  
        let me = await  prisma.user.findUnique({where:{id:this.pk}});
        if(me)return;
        this.redis.set(`ref`,id,{'EX':60*60*24});
        bot.telegram.sendMessage(adminId,`Someone trying to enter by the someone link.`);
    }
    async checkIfollowed(username: string) {       
        let user:User = await this.profile();
        const myUsername = user.igUsername;
        const job = queue.createJob({usernameToFollow:username,followerIGId:user.igId,followerUsername:myUsername,followerPk:this.pk,followerLang:this.lang});
        job.save();
        this.translate('wearechecking').send();
        await this.addAccountToSkipped(username);
    }
    ctx?:MyContext;
    lang: string;
    pk: number
    redis:Redis
    keyboard:Keyboard
    username:string|undefined
    i18n:I18n;
    constructor(pk:number,lang:string='en',ctx?:MyContext){
        this.ctx = ctx;
        this.lang = lang;
        this.pk = pk;
        this.redis = new Redis(this.pk);
        this.keyboard = new Keyboard(this);
        this.i18n = i18n;
        this.i18n.setLocale(this.lang);
    }
    myLink(){
        return `https://t.me/${process.env.BOT_USERNAME}/?start=${this.pk}`
    }
    async addGems(gems:number){
        return await prisma.user.update({where:{id:this.pk},data:{gems:{increment:gems}}})
    }
    async deductGems(gems:number){
        return await prisma.user.update({where:{id:this.pk},data:{gems:{decrement:gems}}})
    }
    async hasSuffecientGems(gems: number){
        let me = await this.profile();
        return me?.gems >= gems;
    }
    async saveFollowAction(otherUserId:string){
        let myProfile = await this.profile()
        await prisma.follow.create({
            data:{
                followed_id:otherUserId,
                follower_id:myProfile.igId
            }
        })
        await prisma.user.update({
            where:{id:this.pk},
            data:{gems:{increment:1}}
        })
        return await prisma.user.update({
            where:{
                igId:otherUserId
            },
            data:{gems:{decrement:1}}
        })
    }
    async followedAccounts(){
        let me = await this.profile();
        let followed = await prisma.follow.findMany({where:{follower_id:{equals:me.igId}},select:{followed:{select:{igUsername:true}}}})
        return followed.map((follow)=>follow?.followed?.igUsername)
    }
    async save(username: string,userId):Promise<{linked:boolean,message?:string}>{
        this.username = username;
        return await new Promise((resolve)=>{
            prisma.user.upsert({
                where:{id:this.pk},
                create:{id:this.pk,igUsername:username.toLowerCase(),igId:userId},
                update:{igUsername:username.toLowerCase(),active:true,igId:userId}
            }).catch(e=>{
                if(e.message.includes("Unique"))
                    resolve({linked:false,message:this.translate("constraintUsername").msg})                
            }).then(()=>{
                this.checkRef(username)
                this.redis.del('sendingusername');
                return resolve({linked:true})
            })
        })
    }
    async checkRef(username: string) {
        let refId = await this.redis.get(`ref`);
        if(!refId)return;
        prisma.user.update({
            where:{id:Number(refId)},
            data:{
                gems:{increment:1}
            }
        }).then(async (result)=>{
            bot.telegram.sendMessage(adminId,`${username} entered using ${result.igUsername} link.`);
            let client = new Client(Number(refId));
            await client.getLang();
            client.translate('enterurlink').send()
        }).catch(()=>{})
        this.redis.del(`ref`);
    }
    async findUserByUsername(username: string):Promise<User|null>{
        return await prisma.user.findUnique({where:{igUsername:username}});
    }
    async getFollowers(igId: string){
        return await prisma.follow.findMany({where:{followed_id:igId},include:{follower:true}});
    }
    async whoUnfollowMe(){
        let me = await this.profile();
        await this.translate('wearechecking').send()
        let [followActions,usernames] = await Promise.all([
            this.getFollowers(me.igId),
            igInstance.getAllFollowers(me.igId)
        ])
        if(!usernames)return;
        let allExpectedUsernames = followActions.map((action)=>action.follower.igUsername);
        let unfollowedme:string[] = [];
        allExpectedUsernames.map((one)=>{
            if(!usernames!.includes(one)){
                unfollowedme.push(one);          
            }
        })
        followActions = followActions.filter((fa)=>unfollowedme.includes(fa.follower.igUsername));
        return notifyUnfollowers(this.pk,followActions);       
    }
    async profile():Promise<User>{
        let user = await prisma.user.findUnique({where:{id:this.pk}})
        this.username = user?.igUsername;
        return user!;
    }
    async getUsername(){
        return this.username || (await this.profile())?.igUsername || "ghyathdarwish"

    }
    setLang(lang:string){
        this.lang = lang;
        this.redis.setProfileData(`locale`,lang);
    }
    async getLang(){
        let lang = await this.redis.getProfileData(`locale`) || 'en';
        this.lang = lang;
        return this.lang;
    }
    translate(key:string,vars={},lang = this.lang){
        const msg = this.i18n.__({phrase:key,locale:lang},vars)
        return {
            msg:msg!,
            send:(extra:ExtraReplyMessage={})=>{
                return this.sendMessage(msg!,extra);
            }
        }
    }
    sendMessage(msg: string,extra:ExtraReplyMessage={}){
        return bot.telegram.sendMessage(this.pk,msg,{...extra,parse_mode:"HTML"}).catch((e)=>{})
    }
    
    generateAccountLink(username: string){
        return `<a href='https://www.instagram.com/${username}'>@${username}</a>`
    }
    async getIGProfile(username = this.username){
        let user = JSON.parse(await this.redis.get('ig')||"{}")
        if(!user?.id){
            user = await igInstance.checkProfile(username) as any
            if(user){
                this.redis.set('ig',JSON.stringify({
                    id:user.id,
                    username:user.username,
                    profile_pic_url_hd:user?.profile_pic_url_hd,
                    edge_follow:{count:user?.edge_follow?.count},
                    edge_followed_by:{count:user?.edge_followed_by?.count},
                }),{'EX':60*60})
            }
        }
        let me = await this.profile()
        if(!user?.id){
            console.log("No uUSER");
            return this.translate('notuserfound').send();
        }
        bot.telegram.sendPhoto(this.pk,{
            url:user.profile_pic_url_hd,
        },
        {
            ...this.keyboard.changeProfileBtn(),
            caption:`${this.translate('account').msg}: ${this.generateAccountLink(user.username)}\n\n${this.translate('following').msg}: <b>${user.edge_follow.count}</b>\n\n${this.translate('followers').msg}: <b>${user.edge_followed_by.count}</b>\n\n${this.translate('gems').msg}: <b>${me?.gems}</b> 💎`,
            parse_mode:"HTML",
        }
        ).catch((e)=>{})
    }
    async sendHomeMsg(){
        let username =(await this.profile())?.igUsername
        if(username){
            return this.translate(`startfollow`).send(this.keyboard.home());
        }
        this.redis.set(`sendingusername`,'true',{"EX":60*60})
        return this.translate(`sendUrUsername`).send();
    }
    async accountSkipped():Promise<string[]>{
        return JSON.parse(await this.redis.get('skipped')||"[]");
    }
    async accountFollowed():Promise<string[]>{
        let profile = await this.profile();
        return JSON.parse(await this.redis.get(`${profile.igId}:followed`)||"[]");
    }
    async addAccountToSkipped(username: string){
        let accounts = await this.accountSkipped();
        // if(accounts.length > 40){
        //     accounts.shift();
        // }
        accounts.push(username)
        this.redis.set('skipped',JSON.stringify(accounts),{"EX":60*60*24*1});
    }
    async sendUser(){
        let me = await this.profile();
        if(!me){
            return this.sendHomeMsg()
        }
        const [accountsSkipped] = await Promise.all([
            this.accountSkipped(),
            // this.accountFollowed()
        ])
        let account = await this.ctx?.prisma.user.findFirst({
            take: 1,
            where:{
                id:{not:{equals:this.pk}},
                active:{equals:true},
                followings:{
                    none:{
                        follower_id:{equals:me.igId}
                    }
                },
                igUsername:{notIn:accountsSkipped},
                gems:{gte:2}
            },
            orderBy: {
                gems:"desc"
            },
        });
        if(!account)return this.translate('notusertofolw').send();
        // const user = await igInstance.checkProfile(account.igUsername) as any;
        // if(!user)return;
        bot.telegram.sendMessage(this.pk,`${this.translate('dofollow',{username:account.igUsername}).msg}\n${this.translate('moregemsmorefollowers').msg}`,
        {
            ...this.keyboard.panel(account.igUsername),
            parse_mode:"HTML",
        }
        ).catch((e)=>{console.log(e);
        })
    }
}
if(!isPausedWorker){
    queue.process(3,async (job)=> {
        const {username,password} = getCredentials();
        const ig = new IG(username,password);
        await ig.login()
        await IG.sleep(500,2000);
        job.retries(1);
        const isFollowed = await ig.checkIfollowed(job.data.usernameToFollow, job.data.followerIGId);
        console.log('Checking ',job.data.usernameToFollow,' ...', isFollowed);
        return isFollowed;
    });

    queue.on('succeeded',async (job,result)=>{
        const followerPk = job.data.followerPk;
        const usernameToFollow = job.data.usernameToFollow;
        const followerUsername = job.data.followerUsername;
        const followerLang = job.data.followerLang;
        const follower = new Client(followerPk,followerLang);
        let fakefollows = parseInt(await follower.redis.get(`fakefollows`)||"0")
        if(!result){
            if(!fakefollows){
                await follower.redis.set('fakefollows',"0",{"EX":60*10})
            }
            return follower.redis.client.incr(`${followerPk}:fakefollows`);
        }
        if(result){
            if(fakefollows>0){
                follower.redis.client.decr(`${followerPk}:fakefollows`);
            }
            const followedAccounts = await follower.followedAccounts();
            if(followedAccounts.includes(usernameToFollow))return;
            bot.telegram.sendMessage(followerPk,`${follower.translate('youvfollowed',{username:usernameToFollow}).msg}\n${follower.translate('moregemsmorefollowers').msg}`,{...follower.keyboard.shareBot(),parse_mode:"HTML"}).catch((e)=>{})
            
            let otherUser = await follower.findUserByUsername(usernameToFollow);
            if(!otherUser)return;
            let oClient = await follower.saveFollowAction(otherUser.igId)
            let otherClient = new Client(otherUser.id);
            let userLang = await otherClient.getLang();
            bot.telegram.sendMessage(otherUser.id,`<b>${followerUsername}</b> ${otherClient.translate('followedyou',{gems:oClient.gems},userLang).msg}`,{
                ...otherClient.keyboard.inlineKeyboard([{text:otherClient.translate('startfollowbtn').msg,callback_data:"sendusertofollow"}]),
                parse_mode:"HTML"}).catch((e)=>{});
        } 
    })
}