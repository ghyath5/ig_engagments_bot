import { Account, Follow, PrismaClient } from ".prisma/client";
import { Client } from "./client";
const prisma = new PrismaClient()
export const notifyUnfollowers = async (pk: number, users: (Follow & { follower: Account | null })[]) => {
    let user = new Client(pk);
    let [username, lang] = await Promise.all([
        user.getUsername(),
        user.getLang()
    ])
    let i = 0;
    await user.addGems((users.length));
    user.translate('yougotgems', { gems: (users.length) }).send()
    function sendNotification() {
        let timeoutcounter = setTimeout(async () => {
            if (i >= users.length) {
                clearTimeout(timeoutcounter);
                return;
            }
            let active = users[i];
            let client = new Client(active.follower!.user_id);
            console.log(`Sending ${i + 1}/${users.length}`);
            prisma.follow.delete({
                where: {
                    followed_id_follower_id: {
                        followed_id: active!.followed_id,
                        follower_id: active!.follower_id,
                    }
                },
                include: {
                    follower: true
                }
            }).then(async (a) => {
                client.deductGems(2);
                await client.getLang();
                await client.translate('detectUnfollow', { name: username }).send()
            })
            i++;
            sendNotification();
        }, 1000)
    }
    sendNotification()
}

export const multipleNotification = async (ids: number[] | string[], callback: (client: Client) => void) => {
    let i = 0;
    function sendNotification() {
        let timeoutcounter = setTimeout(async () => {
            if (i >= ids.length) {
                return clearTimeout(timeoutcounter);
            }
            let active = ids[i];
            let client = new Client(Number(active));
            console.log(`Sending ${i + 1}/${ids.length}`);
            await client.getLang()
            callback(client)
            i++;
            sendNotification();
        }, 500)
    }
    sendNotification()
}