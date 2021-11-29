import { PrismaClient, User } from ".prisma/client"
interface GeoUser {
    id: Number
    dist: Number
    username: string
    gems: Number
}
export class UserRaw {
    pk: number | string
    prisma: PrismaClient
    constructor(pk: string | number, prisma: PrismaClient) {
        this.pk = pk;
        this.prisma = prisma
    }

    async setUserLocation(long, lat) {
        await this.prisma.$executeRaw<User>`UPDATE "User" SET location = extensions.ST_SetSRID(extensions.ST_MakePoint(${long}::float,${lat}::float),4326) WHERE id = ${this.pk};`
        let user = await this.prisma.user.findUnique({ where: { id: Number(this.pk) } })
        return user;
    }
    async getUsersHaveNoLocation() {
        try {
            const result = await this.prisma.$queryRaw<Array<User>>`SELECT id FROM "User" WHERE location is null`;
            return result;
        } catch (e) {
            console.log(e);
        }
    }

    async nearByUsers(skippedUsernames: string[]): Promise<GeoUser[]> {
        let skipped = skippedUsernames.join(',') ? skippedUsernames.join(',') : ''
        try {
            const result = await this.prisma.$queryRawUnsafe<GeoUser[]>(`SELECT * FROM relevantAccount(${this.pk}, '{${skipped}}', 600000, 1)`)
            return result;
        } catch (e) {
            console.log(e);
            return []
        }
    }
}