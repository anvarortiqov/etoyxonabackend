import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, UpdateBookingDto, CancelBookingDto, QueryBookingsDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/enums';

@ApiTags('bookings')
@Controller('venues/:venueId/bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles(Role.OWNER, Role.MANAGER, Role.STAFF)
  @ApiOperation({ summary: 'Yangi buyurtma yaratish' })
  async create(
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @CurrentUser('sub') userId: string,
    @Body() data: CreateBookingDto,
  ) {
    return this.bookingsService.create(venueId, userId, data);
  }

  @Get()
  @ApiOperation({ summary: 'Buyurtmalar ro\'yxati' })
  async findAll(
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @Query() query: QueryBookingsDto,
  ) {
    return this.bookingsService.findAll(venueId, query, {
      status: query.status,
      eventDate: query.eventDate,
      hallId: query.hallId,
    });
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Kalendar ko\'rinishi' })
  async getCalendar(
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @Query('month') month: string,
  ) {
    return this.bookingsService.getCalendar(venueId, month);
  }

  @Get('check-availability')
  @ApiOperation({ summary: 'Mavjudlikni tekshirish' })
  async checkAvailability(
    @Query('hallId') hallId: string,
    @Query('eventDate') eventDate: string,
    @Query('timeSlot') timeSlot: string,
    @Query('customStartTime') customStartTime?: string,
    @Query('customEndTime') customEndTime?: string,
  ) {
    const available = await this.bookingsService.checkAvailability(
      hallId,
      eventDate,
      timeSlot,
      undefined,
      customStartTime,
      customEndTime,
    );
    return { available };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buyurtma tafsilotlari' })
  async findOne(
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookingsService.findOne(id, venueId);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Buyurtmani tahrirlash' })
  async update(
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateBookingDto,
  ) {
    return this.bookingsService.update(venueId, id, data as any);
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Buyurtmani o\'chirish' })
  async remove(
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookingsService.remove(venueId, id);
  }

  @Post(':id/cancel')
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Buyurtmani bekor qilish' })
  async cancel(
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingsService.cancel(venueId, id, dto, userId);
  }
}
