const data = {}
export class Memory  {
    pk:string | number
    constructor(pk: number|string){
        this.pk = pk
    }
    set(key: string | number,value: any){
        data[`${this.pk}_${key}`] = value;
    }
    get<T>(key: string | number):T{
        return data[`${this.pk}_${key}`] as T;
    }
    push(key,value){
        let arr = data[`${this.pk}_${key}`] as Array<any> || [];
        arr.push(value)
        data[`${this.pk}_${key}`] = arr;
        return arr;
    }
    shift(key,value){
        let arr = data[`${this.pk}_${key}`] as Array<any> || [];
        arr = arr.filter((item)=>item!=value);
        data[`${this.pk}_${key}`] = arr;
        return arr;
    }
};