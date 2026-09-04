import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  public readonly extended : any;

  //constructor(private configService: ConfigService) {
    // const server = configService.get<string>('DB_SERVER');
    // const port = Number(configService.get<string>('DB_PORT'));
    // const database = configService.get<string>('DB_NAME');
    // const user = configService.get<string>('DB_USER');
    // const password = configService.get<string>('DB_PASS');

    // const adapter = new PrismaMssql({
    //   server,
    //   port,
    //   database,
    //   user,
    //   password,
    //   options: {
    //     encrypt: true,
    //     trustServerCertificate: true,
    //     enableArithAbort: true,
    //   },
    // });

    // super({
    //   adapter: adapter as any,
    //   log: ['info', 'warn', 'error'],
    // });

    // this.extended = this.$extends(loggingExtension);
  //}

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}