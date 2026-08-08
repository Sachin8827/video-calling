import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  checkHealth(): Record<string, string> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'nexus-backend',
    };
  }
}
