/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    try {
      return user;
    } catch (error) {
      console.error(err);
    }
  }
}
