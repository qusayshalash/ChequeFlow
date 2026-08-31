import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { ChequeAction, Permission } from '@cheque-flow/shared-types';
import { DEFAULT_LOCALE, isLocale } from '@cheque-flow/localization';
import {
  bounceChequeSchema,
  bulkChequeActionSchema,
  cancelChequeSchema,
  clearChequeSchema,
  createChequeBatchSchema,
  createChequeSchema,
  depositChequeSchema,
  handoverChequeSchema,
  createReminderSchema,
  createWhatsAppReminderSchema,
  listChequesQuerySchema,
  markLostChequeSchema,
  postponeChequeSchema,
  receiveChequeSchema,
  returnChequeSchema,
  reviewChequeSchema,
  updateChequeSchema,
  uploadImageMetadataSchema,
  type BounceChequeInput,
  type BulkChequeActionInput,
  type CancelChequeInput,
  type ClearChequeInput,
  type CreateChequeBatchInput,
  type CreateChequeInput,
  type CreateReminderInput,
  type CreateWhatsAppReminderInput,
  type DepositChequeInput,
  type HandoverChequeInput,
  type ListChequesQuery,
  type MarkLostChequeInput,
  type PostponeChequeInput,
  type ReceiveChequeInput,
  type ReturnChequeInput,
  type ReviewChequeInput,
  type UpdateChequeInput,
} from '@cheque-flow/validation';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { ChequeImagesService } from '../cheque-images/cheque-images.service';
import { AppError } from '../../common/errors/app-error';
import { ExportService } from '../export/export.service';
import { OcrService } from '../ocr/ocr.service';
import { RemindersService } from '../reminders/reminders.service';
import { ChequeActionsService, type ChequeActionPayload } from './cheque-actions.service';
import { ChequeService } from './cheque.service';

/** Multipart uploads arrive through multer; only the fields we use are typed. */
interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@ApiTags('cheques')
@ApiBearerAuth()
@Controller('cheques')
export class ChequeController {
  /**
   * Most rows one export may serialize. Beyond this the caller is told the
   * file is partial rather than handed a silently trimmed one.
   */
  private static readonly EXPORT_ROW_LIMIT = 5000;

  constructor(
    private readonly cheques: ChequeService,
    private readonly actions: ChequeActionsService,
    private readonly images: ChequeImagesService,
    private readonly ocr: OcrService,
    private readonly exporter: ExportService,
    private readonly reminders: RemindersService,
  ) {}

  @Get()
  @RequirePermissions(Permission.CHEQUE_VIEW)
  @ApiOperation({ summary: 'List cheques with filtering, sorting and pagination' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, isArray: true })
  @ApiQuery({ name: 'dueFrom', required: false, example: '2026-01-01' })
  list(
    @CurrentUser() user: RequestUser,
    @Query(zodQuery(listChequesQuerySchema)) query: ListChequesQuery,
  ) {
    return this.cheques.list(user, query);
  }

  @Post()
  @RequirePermissions(Permission.CHEQUE_CREATE)
  @ApiOperation({ summary: 'Create a cheque (DRAFT) and its CREATED event' })
  @ApiQuery({
    name: 'allowDuplicate',
    required: false,
    description: 'Proceed even when a matching cheque already exists',
  })
  @ApiResponse({ status: 201, description: 'Created, with any duplicate matches found' })
  @ApiResponse({ status: 409, description: 'DUPLICATE_CHEQUE' })
  create(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(createChequeSchema)) body: CreateChequeInput,
    @Query('allowDuplicate') allowDuplicate: string | undefined,
    @Req() request: Request,
  ) {
    return this.cheques.create(
      user,
      body,
      { allowDuplicate: allowDuplicate === 'true' },
      AuditService.contextFromRequest(request),
    );
  }

  /**
   * One action, many cheques.
   *
   * Returns 200 with `status: 'BLOCKED'` — not an error — when the selection
   * contains a cheque that cannot take the action and `skipInvalid` was not
   * set. Nothing is written in that case, and `skipped` names the cheques and
   * why, so the screen can show the user what to deselect.
   */
  @Post('bulk-action')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply one lifecycle action to a selection of cheques' })
  @ApiResponse({
    status: 200,
    description: 'Report of what was applied and what was skipped',
  })
  bulkAction(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(bulkChequeActionSchema)) body: BulkChequeActionInput,
    @Req() request: Request,
  ) {
    const { chequeIds, action, skipInvalid, ...payload } = body;
    return this.actions.executeBulk(
      user,
      chequeIds,
      action,
      payload,
      { skipInvalid },
      AuditService.contextFromRequest(request),
    );
  }

  /**
   * A literal segment declared ahead of the `:id` routes below, so that
   * `/cheques/batch` is never matched as a cheque whose id is "batch".
   */
  @Post('batch')
  @RequirePermissions(Permission.CHEQUE_CREATE)
  @ApiOperation({ summary: 'Create a run of serial cheques in one transaction' })
  @ApiQuery({
    name: 'allowDuplicate',
    required: false,
    description: 'Proceed even when some rows match cheques already on file',
  })
  @ApiResponse({ status: 201, description: 'All cheques created, with any duplicate matches' })
  @ApiResponse({ status: 409, description: 'DUPLICATE_CHEQUE — nothing was created' })
  createBatch(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(createChequeBatchSchema)) body: CreateChequeBatchInput,
    @Query('allowDuplicate') allowDuplicate: string | undefined,
    @Req() request: Request,
  ) {
    return this.cheques.createBatch(
      user,
      body,
      { allowDuplicate: allowDuplicate === 'true' },
      AuditService.contextFromRequest(request),
    );
  }

  /**
   * Declared before `:id` on purpose — Nest matches routes in declaration
   * order, and `@Get(':id')` would otherwise swallow `/cheques/export`.
   */
  @Get('export')
  @RequirePermissions(Permission.CHEQUE_EXPORT)
  @ApiOperation({ summary: 'Export the filtered cheque list as CSV' })
  @ApiQuery({ name: 'locale', required: false, example: 'ar' })
  @ApiResponse({
    status: 200,
    description:
      'CSV. When the result exceeds the row ceiling the response carries ' +
      'X-Export-Truncated and X-Export-Total, and the file itself ends with a ' +
      'warning row.',
  })
  async exportCsv(
    @CurrentUser() user: RequestUser,
    @Query(zodQuery(listChequesQuerySchema)) query: ListChequesQuery,
    @Query('locale') locale: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    // Export the whole filtered set, not just the caller's current page, but
    // keep a hard ceiling so one request cannot try to serialize the database.
    const page = await this.cheques.list(user, {
      ...query,
      page: 1,
      pageSize: ChequeController.EXPORT_ROW_LIMIT,
    });

    const truncated = page.meta.total > page.data.length;
    const resolvedLocale = locale !== undefined && isLocale(locale) ? locale : DEFAULT_LOCALE;

    const csv = this.exporter.chequesToCsv(page.data, resolvedLocale, {
      ...(truncated ? { truncated: { limit: page.data.length, total: page.meta.total } } : {}),
    });

    await this.cheques.recordExport(
      user,
      page.data.length,
      AuditService.contextFromRequest(request),
    );

    const filename = `cheques-${new Date().toISOString().slice(0, 10)}.csv`;
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // A partial financial export that does not announce itself is how a
    // reconciliation gets closed against incomplete data. Say so in the
    // headers for clients, and in the file for whoever opens it.
    if (truncated) {
      response.setHeader('X-Export-Truncated', 'true');
      response.setHeader('X-Export-Total', String(page.meta.total));
    }

    response.send(csv);
  }

  @Get(':id')
  @RequirePermissions(Permission.CHEQUE_VIEW)
  @ApiOperation({ summary: 'Cheque details, including the actions the caller may perform' })
  findOne(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cheques.findById(user, id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.CHEQUE_UPDATE)
  @ApiOperation({ summary: 'Update cheque data (never its status)' })
  @ApiResponse({ status: 409, description: 'VERSION_CONFLICT' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateChequeSchema)) body: UpdateChequeInput,
    @Req() request: Request,
  ) {
    return this.cheques.update(user, id, body, AuditService.contextFromRequest(request));
  }

  @Post(':id/reminders')
  @RequirePermissions(Permission.CHEQUE_VIEW)
  @ApiOperation({ summary: 'Set your own reminder on a cheque' })
  async createReminder(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(createReminderSchema)) body: CreateReminderInput,
  ): Promise<{ id: string }> {
    const created = await this.reminders.createCustom(
      user.organizationId,
      user.id,
      id,
      new Date(body.remindAt),
      body.note ?? null,
    );
    if (!created) throw AppError.notFound('Cheque', id);
    return created;
  }

  /**
   * Logs a WhatsApp reminder the user has just sent from their own phone.
   *
   * The system does not send it — there is no business account behind this, and
   * pretending otherwise would be a capability that silently fails. What it
   * records is that a person did, so nobody chases the same customer twice.
   */
  @Post(':id/whatsapp-reminder')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.CHEQUE_VIEW)
  @ApiOperation({ summary: 'Record that a WhatsApp reminder was sent by hand' })
  async recordWhatsApp(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(createWhatsAppReminderSchema)) body: CreateWhatsAppReminderInput,
  ) {
    const created = await this.reminders.recordWhatsAppSent(
      user.organizationId,
      user.id,
      id,
      body.note ?? null,
    );
    if (!created) throw AppError.notFound('Cheque', id);
    return created;
  }

  @Get(':id/events')
  @RequirePermissions(Permission.CHEQUE_VIEW)
  @ApiOperation({ summary: 'Immutable cheque timeline' })
  async events(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.actions.listEvents(user, id) };
  }

  // ── images ────────────────────────────────────────────────────────────────

  @Post(':id/images')
  @RequirePermissions(Permission.CHEQUE_CREATE)
  @Throttle({ upload: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'side'],
      properties: {
        file: { type: 'string', format: 'binary' },
        side: { type: 'string', enum: ['FRONT', 'BACK', 'ATTACHMENT'] },
        capturedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a cheque image (type verified from its bytes)' })
  uploadImage(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedImageFile | undefined,
    @Body(zodBody(uploadImageMetadataSchema))
    metadata: { side: 'FRONT' | 'BACK' | 'ATTACHMENT'; capturedAt?: string },
    @Query('allowDuplicate') allowDuplicate: string | undefined,
    @Req() request: Request,
  ) {
    if (!file) {
      return Promise.reject(new Error('No file uploaded'));
    }
    return this.images.upload(
      user,
      id,
      {
        side: metadata.side,
        capturedAt: metadata.capturedAt,
        buffer: file.buffer,
        declaredMimeType: file.mimetype,
        originalName: file.originalname,
      },
      { allowDuplicate: allowDuplicate === 'true' },
      AuditService.contextFromRequest(request),
    );
  }

  @Get(':id/images')
  @RequirePermissions(Permission.CHEQUE_VIEW)
  @ApiOperation({ summary: 'List the images attached to a cheque' })
  listImages(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.images.list(user, id);
  }

  @Get(':id/images/:imageId/url')
  @RequirePermissions(Permission.CHEQUE_VIEW_IMAGE)
  @ApiOperation({ summary: 'Short-lived signed URL for one image (audited)' })
  imageUrl(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Req() request: Request,
  ) {
    return this.images.getSignedUrl(user, id, imageId, AuditService.contextFromRequest(request));
  }

  // ── OCR + review ──────────────────────────────────────────────────────────

  @Post(':id/process-ocr')
  @RequirePermissions(Permission.CHEQUE_CREATE)
  @Throttle({ ocr: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run OCR and store the result as an unconfirmed suggestion' })
  processOcr(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ocr.process(user, id);
  }

  @Get(':id/ocr-suggestion')
  @RequirePermissions(Permission.CHEQUE_VIEW)
  @ApiOperation({ summary: 'Latest OCR suggestion, with the low-confidence fields flagged' })
  ocrSuggestion(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ocr.latestSuggestion(user, id);
  }

  @Post(':id/review')
  @RequirePermissions(Permission.CHEQUE_REVIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm the reviewed data and verify the cheque' })
  review(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(reviewChequeSchema)) body: ReviewChequeInput,
    @Req() request: Request,
  ) {
    return this.ocr.review(user, id, body, AuditService.contextFromRequest(request));
  }

  // ── state machine actions ─────────────────────────────────────────────────

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record that the cheque was received from a contact' })
  receive(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(receiveChequeSchema)) body: ReceiveChequeInput,
    @Req() request: Request,
  ) {
    return this.run(user, id, ChequeAction.RECEIVE, request, {
      fromContactId: body.fromContactId,
      toLocationId: body.toLocationId,
      toUserId: body.toUserId,
      effectiveDate: body.receivedDate,
      notes: body.notes,
      eventDate: body.eventDate,
      approvedBy: body.approvedBy,
      version: body.version,
    });
  }

  @Post(':id/handover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hand the cheque over to a supplier or third party' })
  handover(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(handoverChequeSchema)) body: HandoverChequeInput,
    @Req() request: Request,
  ) {
    return this.run(user, id, ChequeAction.HANDOVER, request, {
      toContactId: body.toContactId,
      toLocationId: body.toLocationId,
      proofAttachmentId: body.proofAttachmentId,
      notes: body.notes,
      eventDate: body.eventDate,
      approvedBy: body.approvedBy,
      version: body.version,
    });
  }

  @Post(':id/deposit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deposit the cheque into a bank account' })
  deposit(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(depositChequeSchema)) body: DepositChequeInput,
    @Req() request: Request,
  ) {
    return this.run(user, id, ChequeAction.DEPOSIT, request, {
      toLocationId: body.toLocationId,
      effectiveDate: body.depositDate,
      notes: body.notes,
      eventDate: body.eventDate,
      approvedBy: body.approvedBy,
      version: body.version,
    });
  }

  @Post(':id/clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark the cheque as cleared' })
  clear(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(clearChequeSchema)) body: ClearChequeInput,
    @Req() request: Request,
  ) {
    return this.run(user, id, ChequeAction.CLEAR, request, {
      effectiveDate: body.clearedDate,
      notes: body.notes,
      eventDate: body.eventDate,
      approvedBy: body.approvedBy,
      version: body.version,
    });
  }

  @Post(':id/bounce')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record that the cheque bounced' })
  bounce(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(bounceChequeSchema)) body: BounceChequeInput,
    @Req() request: Request,
  ) {
    return this.run(user, id, ChequeAction.BOUNCE, request, {
      reason: body.reason,
      fee: body.fee,
      effectiveDate: body.bouncedDate,
      notes: body.notes,
      eventDate: body.eventDate,
      approvedBy: body.approvedBy,
      version: body.version,
    });
  }

  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Return the cheque to its source' })
  returnCheque(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(returnChequeSchema)) body: ReturnChequeInput,
    @Req() request: Request,
  ) {
    return this.run(user, id, ChequeAction.RETURN, request, {
      toContactId: body.toContactId,
      reason: body.reason,
      notes: body.notes,
      eventDate: body.eventDate,
      approvedBy: body.approvedBy,
      version: body.version,
    });
  }

  @Post(':id/postpone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Postpone the cheque to a new due date' })
  postpone(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(postponeChequeSchema)) body: PostponeChequeInput,
    @Req() request: Request,
  ) {
    return this.run(user, id, ChequeAction.POSTPONE, request, {
      effectiveDate: body.newDueDate,
      reason: body.reason,
      notes: body.notes,
      eventDate: body.eventDate,
      approvedBy: body.approvedBy,
      version: body.version,
    });
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel the cheque (requires cheque.cancel)' })
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(cancelChequeSchema)) body: CancelChequeInput,
    @Req() request: Request,
  ) {
    return this.run(user, id, ChequeAction.CANCEL, request, {
      reason: body.reason,
      notes: body.notes,
      eventDate: body.eventDate,
      approvedBy: body.approvedBy,
      version: body.version,
    });
  }

  @Post(':id/mark-lost')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record the cheque as lost' })
  markLost(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(markLostChequeSchema)) body: MarkLostChequeInput,
    @Req() request: Request,
  ) {
    return this.run(user, id, ChequeAction.MARK_LOST, request, {
      reason: body.reason,
      notes: body.notes,
      eventDate: body.eventDate,
      approvedBy: body.approvedBy,
      version: body.version,
    });
  }

  /**
   * Every action funnels through the state machine executor. Permissions for
   * actions are enforced there, from the transition table, so the controller
   * cannot accidentally allow a transition the table forbids.
   */
  private run(
    user: RequestUser,
    chequeId: string,
    action: ChequeAction,
    request: Request,
    payload: ChequeActionPayload,
  ) {
    return this.actions.execute(
      user,
      chequeId,
      action,
      payload,
      AuditService.contextFromRequest(request),
    );
  }
}
