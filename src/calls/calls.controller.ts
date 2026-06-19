import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CallsService } from './calls.service';

/** Thin REST controller for call history & details. Real-time call actions go through SignalingGateway. */
@ApiTags('calls')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  /** GET /api/v1/calls/history — paginated call history for authenticated user */
  @Get('history')
  @ApiOperation({ summary: 'Get paginated call history for the authenticated user' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Page limit (default: 20)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Page offset (default: 0)' })
  @ApiResponse({ status: 200, description: 'Returned call history list successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getHistory(
    @Req() req: Request & { user: { sub: string } },
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.callsService.getCallHistory(req.user.sub, limit, offset);
  }

  /** GET /api/v1/calls/:callId — details of a specific call */
  @Get(':callId')
  @ApiOperation({ summary: 'Get call details by ID' })
  @ApiResponse({ status: 200, description: 'Returned call details successfully.' })
  @ApiResponse({ status: 404, description: 'Call session not found.' })
  async getCall(@Param('callId') callId: string) {
    return this.callsService.getCallById(callId);
  }

  /** GET /api/v1/calls/:callId/participants */
  @Get(':callId/participants')
  @ApiOperation({ summary: 'Get participants list of a call' })
  @ApiResponse({ status: 200, description: 'Returned participants list successfully.' })
  @ApiResponse({ status: 404, description: 'Call session not found.' })
  async getParticipants(@Param('callId') callId: string) {
    return this.callsService.getParticipants(callId);
  }
}
