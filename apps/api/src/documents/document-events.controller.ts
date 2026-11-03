import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrincipalGuard } from '../common/principal.guard.js';
import { Roles, RolesGuard, WorkspaceMemberGuard } from '../common/roles.decorator.js';
import { DocumentEventsService } from './document-events.service.js';
import { setSseHeaders, formatSseEvent, formatSseComment } from '../common/sse.js';

@Controller('workspaces/:wid/documents/events')
@UseGuards(PrincipalGuard, WorkspaceMemberGuard, RolesGuard)
@Roles('ADMIN')
export class DocumentEventsController {
  constructor(private readonly eventsService: DocumentEventsService) {}

  @Get()
  streamEvents(
    @Param('wid') wid: string,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    setSseHeaders(res);
    res.flushHeaders?.();

    const unsubscribe = this.eventsService.subscribe(wid, (payload) => {
      res.write(formatSseEvent('document.status', payload));
    });

    const pingInterval = setInterval(() => {
      res.write(formatSseComment('ping'));
    }, 20000);

    req.on('close', () => {
      clearInterval(pingInterval);
      unsubscribe();
    });
  }
}
