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
                user.addGems(users.length-2);
                clearTimeout(timeoutcounter);
                return user.translate('yougotgems',{gems:users.length-2}).send()
            }
            let active = users[i];
            let client = new Client(active.follower.id);
            // await client.getLang();
            // await client.translate('detectUnfollow',{name:username}).send()
            console.log(`Sending ${i+1}/${users.length}`);
            prisma.account.delete({
                where:{
                    followed_id_follower_id:{
                        followed_id:active.followed_id,
                        follower_id:active.follower_id,
                    }
                }
            }).catch((e)=>{
                console.log(e);
                
            }).then((a)=>{
                console.log('Deleted ', i);
                
            })
            // client.deductGems(1);
            i++;
            sendNotification();
        },500)
    }
    sendNotification()
}

export const multipleNotification = async (msg:string,ids:number[]|string[])=>{

}