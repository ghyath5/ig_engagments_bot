import { PrismaClient } from '.prisma/client';
import Queue from 'bull';
import { Client } from './client';
import { client } from './redis';
const prisma = new PrismaClient();
const unfollowers = new Queue('Detect unfollowers', process.env.DB_REDIS_URL!, {
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true
    }
});

unfollowers.process(async function (job, done) {
    let last_check_date = await client.get(`last_unfollow_check`)
    let result = await prisma.account.findFirst({
        where: {
            active: true,
            main: true,
            owner: {
                active: true,
                createdAt: {
                    gt: new Date(last_check_date || new Date(2000, 6))
                }
            },
        },
        include: { owner: true },
        orderBy: {
            owner: {
                createdAt: 'asc'
            }
        }
    })
    let date = result?.owner.createdAt.toISOString() || new Date(2000, 6, 24).toISOString()
    client.set(`last_unfollow_check`, date)
    if (!result) return;
    const user = new Client(result?.user_id)
    await user.getLang()
    user.whoUnfollowMe();
    done();
});
unfollowers.add({}, { repeat: { cron: '*/12 * * * *' } });
