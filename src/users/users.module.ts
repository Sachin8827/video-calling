import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserRepository } from './repositories/user.repository';
import { USER_REPOSITORY } from './repositories/user.repository.interface';

@Module({
  providers: [UsersService, { provide: USER_REPOSITORY, useClass: UserRepository }],
  exports: [UsersService],
})
export class UsersModule {}
