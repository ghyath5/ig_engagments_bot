export interface MemoSession {
    wating: boolean;
    recentlyFollowed:string
}
import { PrismaClient } from '.prisma/client';
import {Context as TelegrafContext} from 'telegraf'
import { Client } from '../client';
import {  Redis } from '../redis';
import { Keyboard } from '../keyboard';
import { I18n } from 'i18n';
import { Memory } from '../memory';

export interface MyContext extends TelegrafContext {
  session:MemoSession
  self:Client;
  keyboard:Keyboard;
  lang:string|undefined
  db:Redis
  prisma: PrismaClient
  pk:number|string
  i18n:I18n,
  memory:Memory
}