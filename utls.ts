import { Account, PrismaClient, User } from ".prisma/client";
import { Client } from "./client";
const prisma = new PrismaClient()
export const notifyUnfollowers = async (pk:number,users:(Account & {follower: User})[])=>{
    let user = new Client(pk);
    let username = await user.getUsername()
    let i = 0;
    function sendNotification(){
        let timeoutcounter = setTimeout(async ()=>{
            if(i >= users.length){
                user.addGems(users.length);
                clearTimeout(timeoutcounter);
                return user.translate('yougotgems',{gems:users.length}).send()
            }
            let active = users[i];
            let client = new Client(active.follower.id);
            console.log(`Sending ${i+1}/${users.length}`);
            prisma.account.delete({
                where:{
                    followed_id_follower_id:{
                        followed_id:active.followed_id,
                        follower_id:active.follower_id,
                    }
                }
            }).then(async(a)=>{
                await client.getLang();
                await client.translate('detectUnfollow',{name:username}).send()
                client.deductGems(1);
            })
            i++;
            sendNotification();
        },500)
    }
    sendNotification()
}

export const multipleNotification = async (msg:string,ids:number[]|string[])=>{

}