import { Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { ContactsService } from './contacts.service';

class UpdateNicknameDto {
  @ApiProperty({ example: 'My Friend', description: 'Custom nickname to assign to the contact.' })
  @IsString()
  @MaxLength(100)
  nickname: string;
}

class AcceptRequestDto {
  @ApiProperty({ example: '86e1189d-cf1b-4f9d-83b3-8c7c72db1a9b', description: 'The ID of the contact save handshake request.' })
  @IsString()
  requestId: string;
}

@ApiTags('contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  /** GET /api/v1/contacts */
  @Get()
  @ApiOperation({ summary: 'List all saved contacts for the user' })
  @ApiResponse({ status: 200, description: 'Returned contacts list successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  list(@Req() req: Request & { user: { sub: string } }) {
    return this.contactsService.listContacts(req.user.sub);
  }

  /** POST /api/v1/contacts/accept — accept a contact save request */
  @Post('accept')
  @ApiOperation({ summary: 'Accept a mutual contact save request' })
  @ApiResponse({ status: 200, description: 'Handshake completed and contact created.' })
  @ApiResponse({ status: 400, description: 'Invalid or already processed request.' })
  accept(
    @Req() req: Request & { user: { sub: string }; ip: string },
    @Body() dto: AcceptRequestDto,
  ) {
    return this.contactsService.acceptContactSave(dto.requestId, req.user.sub, req.ip);
  }

  /** POST /api/v1/contacts/reject/:requestId */
  @Post('reject/:requestId')
  @ApiOperation({ summary: 'Reject a mutual contact save request' })
  @ApiResponse({ status: 200, description: 'Handshake request rejected successfully.' })
  reject(@Req() req: Request & { user: { sub: string } }, @Param('requestId') requestId: string) {
    return this.contactsService.rejectContactSave(requestId, req.user.sub);
  }

  /** PATCH /api/v1/contacts/:contactId/nickname */
  @Patch(':contactId/nickname')
  @ApiOperation({ summary: 'Update the nickname of a saved contact' })
  @ApiResponse({ status: 200, description: 'Contact nickname updated.' })
  @ApiResponse({ status: 404, description: 'Contact not found.' })
  updateNickname(
    @Req() req: Request & { user: { sub: string } },
    @Param('contactId') contactId: string,
    @Body() dto: UpdateNicknameDto,
  ) {
    return this.contactsService.updateNickname(req.user.sub, contactId, dto.nickname);
  }

  /** DELETE /api/v1/contacts/:contactId */
  @Delete(':contactId')
  @ApiOperation({ summary: 'Delete a contact from saved list' })
  @ApiResponse({ status: 200, description: 'Contact removed successfully.' })
  @ApiResponse({ status: 404, description: 'Contact not found.' })
  remove(@Req() req: Request & { user: { sub: string } }, @Param('contactId') contactId: string) {
    return this.contactsService.removeContact(req.user.sub, contactId);
  }
}
