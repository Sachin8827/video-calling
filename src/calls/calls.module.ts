import { Module } from '@nestjs/common';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';
import { CallsRepository } from './calls.repository';

@Module({
  controllers: [CallsController],
  providers: [CallsService, CallsRepository],
  exports: [CallsService],
})
export class CallsModule {}
