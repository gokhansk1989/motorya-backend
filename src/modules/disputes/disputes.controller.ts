import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DisputesService } from './disputes.service';
import { OpenDisputeDto, AddDisputeMessageDto, ResolveDisputeDto } from './dto/disputes.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('disputes')
@UseGuards(AuthGuard('jwt'))
export class DisputesController {
  constructor(private disputesService: DisputesService) {}

  @Post()
  open(@Request() req, @Body() dto: OpenDisputeDto) {
    return this.disputesService.openDispute(req.user.id, dto);
  }

  @Get('mine')
  getMine(@Request() req) {
    return this.disputesService.getMyDisputes(req.user.id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  listAll() {
    return this.disputesService.listDisputes();
  }

  @Get(':id')
  getOne(@Param('id') id: string, @Request() req) {
    return this.disputesService.getDispute(id, req.user.id);
  }

  @Post(':id/messages')
  addMessage(@Param('id') id: string, @Request() req, @Body() dto: AddDisputeMessageDto) {
    return this.disputesService.addMessage(id, req.user.id, dto);
  }

  @Patch(':id/resolve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')
  resolve(@Param('id') id: string, @Request() req, @Body() dto: ResolveDisputeDto) {
    return this.disputesService.resolveDispute(id, req.user.id, dto);
  }
}
