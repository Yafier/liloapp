"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { format, parseISO, differenceInHours, addHours, isSameDay, startOfDay } from 'date-fns';
import toast from 'react-hot-toast';
import { MapPin, Star, Loader2, Shield, Clock, Calendar, Monitor, DollarSign, AlertTriangle, Phone, ChevronLeft, Info } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { PaymentModal } from '@/components/payment-modal';
import { Navbar } from "@/components/ui/navbar";
import Image from 'next/image';
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";

interface BookingDetails {
  streamerId: string;
  streamerName: string;
  date: string;
  startTime: string;
  endTime: string;
  platform: string;
  price: number;
  location: string;
  rating: number;
}

interface TimeSlot {
  start: string;
  end: string;
}

interface DaySchedule {
  slots: TimeSlot[];
}

interface ActiveSchedule {
  [key: number]: DaySchedule;
}

interface PaymentResult {
  status: string;
  transaction_id?: string;
  message?: string;
}

const platformStyles = {
  shopee: 'bg-gradient-to-r from-orange-500 to-orange-600',
  tiktok: 'bg-gradient-to-r from-[#00f2ea] to-[#ff0050]',
};

export default function BookingDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>('qris');
  const [specialRequest, setSpecialRequest] = useState<string>('');
  const [subAccountLink, setSubAccountLink] = useState('');
  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [activeSchedule, setActiveSchedule] = useState<any>(null);
  const [paymentToken, setPaymentToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (searchParams) {
      const details: BookingDetails = {
        streamerId: searchParams.get('streamerId') || '',
        streamerName: searchParams.get('streamerName') || '',
        date: searchParams.get('date') || '',
        startTime: searchParams.get('startTime') || '',
        endTime: searchParams.get('endTime') || '',
        platform: searchParams.get('platform') || '',
        price: Number(searchParams.get('price')) || 0,
        location: decodeURIComponent(searchParams.get('location') || ''),
        rating: Number(searchParams.get('rating')) || 0,
      };
      setBookingDetails(details);
      
      // Initialize selectedHours based on startTime and endTime
      if (details.startTime && details.endTime) {
        const start = parseInt(details.startTime.split(':')[0]);
        const end = parseInt(details.endTime.split(':')[0]);
        setSelectedHours(
          Array.from({ length: end - start }, (_, i) => 
            `${(start + i).toString().padStart(2, '0')}:00`
          )
        );
      }

      fetchBookings();
      fetchActiveSchedule();
    }
  }, [searchParams]);

  const fetchBookings = async () => {
    const supabase = createClient();
    const streamerId = searchParams?.get('streamerId');
    if (!streamerId) return;

    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('streamer_id', streamerId)
      .in('status', ['accepted', 'pending']);

    if (error) {
      console.error('Error fetching bookings:', error);
      toast.error('Failed to fetch bookings');
    } else {
      setBookings(data || []);
    }

    // Set up real-time subscription
    const bookingSubscription = supabase
      .channel('public:bookings')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'bookings', filter: `streamer_id=eq.${streamerId}` },
        () => {
          fetchBookings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(bookingSubscription);
    };
  };

  const fetchActiveSchedule = async () => {
    const supabase = createClient();
    const streamerId = searchParams?.get('streamerId');
    if (!streamerId) return;

    const { data, error } = await supabase
      .from('streamer_active_schedules')
      .select('schedule')
      .eq('streamer_id', streamerId)
      .single();

    if (error) {
      console.error('Error fetching active schedule:', error);
    } else if (data) {
      setActiveSchedule(JSON.parse(data.schedule));
    }
  };

  const isSlotAvailable = useCallback((date: Date, hour: number) => {
    if (!bookingDetails || !activeSchedule) return false;
    const daySchedule = activeSchedule[date.getDay()];
    if (!daySchedule || !daySchedule.slots) return false;
  
    const isInSchedule = daySchedule.slots.some((slot: any) => {
      const start = parseInt(slot.start.split(':')[0]);
      const end = parseInt(slot.end.split(':')[0]);
      return hour >= start && hour < end;
    });

    const bookingExists = bookings.some(booking => {
      const bookingStart = new Date(booking.start_time);
      const bookingEnd = new Date(booking.end_time);
      return (
        isSameDay(date, bookingStart) &&
        (
          (hour >= bookingStart.getHours() && hour < bookingEnd.getHours()) ||
          (hour === bookingEnd.getHours() && bookingEnd.getHours() > bookingStart.getHours())
        )
      );
    });

    return isInSchedule && !bookingExists;
  }, [bookingDetails, activeSchedule, bookings]);

  const generateTimeOptions = () => {
    if (!bookingDetails) return [];
    const start = parseInt(bookingDetails.startTime.split(':')[0]);
    const end = parseInt(bookingDetails.endTime.split(':')[0]);
    const options = Array.from({ length: end - start }, (_, i) => `${(start + i).toString().padStart(2, '0')}:00`);
    
    // Filter out hours that are not available
    return options.filter(hour => isSlotAvailable(new Date(bookingDetails.date), parseInt(hour)));
  };

  const handleHourSelection = (hour: string) => {
    setSelectedHours((prevSelected) => {
      if (prevSelected.includes(hour)) {
        return prevSelected.filter((h) => h !== hour);
      } else {
        const newSelected = [...prevSelected, hour].sort();
        if (newSelected.length > 1) {
          const start = newSelected[0];
          const end = newSelected[newSelected.length - 1];
          return Array.from({ length: parseInt(end) - parseInt(start) + 1 }, (_, i) => 
            `${(parseInt(start) + i).toString().padStart(2, '0')}:00`
          ).filter(h => isSlotAvailable(new Date(bookingDetails!.date), parseInt(h)));
        }
        return newSelected;
      }
    });
  };

  const handleConfirmBooking = async () => {
    if (!bookingDetails || isLoading) return;

    try {
      setIsLoading(true);
      const supabase = createClient();
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be logged in to confirm a booking.');
        return;
      }

      // Generate payment token and create booking
      const paymentResponse = await fetch('/api/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: total,
          clientName: `${user.user_metadata.first_name} ${user.user_metadata.last_name}`,
          clientEmail: user.email,
          description: `Booking with ${bookingDetails.streamerName} for ${format(parseISO(`${bookingDetails.date}T${selectedHours[0]}`), 'PPP')} at ${selectedHours[0]} - ${format(addHours(parseISO(`${bookingDetails.date}T${selectedHours[selectedHours.length - 1]}`), 1), 'HH:mm')}`,
          metadata: {
            streamerId: bookingDetails.streamerId,
            userId: user.id,
            startTime: `${bookingDetails.date}T${selectedHours[0]}`,
            endTime: addHours(parseISO(`${bookingDetails.date}T${selectedHours[selectedHours.length - 1]}`), 1).toISOString(),
            platform: bookingDetails.platform,
            specialRequest: specialRequest,
            subAccountLink: subAccountLink,
            firstName: user.user_metadata.first_name,
            lastName: user.user_metadata.last_name,
            price: total
          }
        }),
      });

      if (!paymentResponse.ok) {
        throw new Error('Failed to create payment token');
      }

      const paymentData = await paymentResponse.json();
      if (!paymentData.token) {
        throw new Error('No payment token received');
      }

      setPaymentToken(paymentData.token);

    } catch (error) {
      console.error('Error initiating payment:', error);
      toast.error('Failed to initiate payment. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentSuccess = async (result: any) => {
    try {
      const supabase = createClient();
      
      // Extract the booking ID from the order ID
      const orderIdParts = result.order_id.split('-');
      const bookingId = parseInt(orderIdParts[1], 10);
      
      if (isNaN(bookingId)) {
        throw new Error('Invalid booking ID format');
      }

      // Get booking details with streamer info including user_id
      const { data: booking } = await supabase
        .from('bookings')
        .select(`
          *,
          streamer:streamers (
            id,
            first_name,
            last_name,
            user_id
          )
        `)
        .eq('id', bookingId)
        .single();

      if (!booking) {
        throw new Error('Booking not found');
      }

      // Create notifications for both parties with correct notification type
      const notifications = [
        {
          user_id: booking.streamer.user_id,
          streamer_id: booking.streamer_id,
          message: `New booking request from ${booking.client_first_name} ${booking.client_last_name}. Payment confirmed.`,
          type: 'confirmation',  // Changed from 'booking_request' to 'confirmation'
          booking_id: bookingId,
          created_at: new Date().toISOString(),
          is_read: false
        },
        {
          user_id: booking.client_id,
          message: `Payment confirmed for booking with ${booking.streamer.first_name} ${booking.streamer.last_name}. Waiting for acceptance.`,
          type: 'confirmation',  // Changed from 'booking_request' to 'confirmation'
          booking_id: bookingId,
          created_at: new Date().toISOString(),
          is_read: false
        }
      ];

      // Insert notifications
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notificationError) {
        console.error('Error creating notifications:', notificationError);
      }

      // Update booking status
      await supabase
        .from('bookings')
        .update({ status: 'pending' })
        .eq('id', bookingId);

      // Show success toast
      toast.success('Payment successful! Booking request has been sent.');
      router.push('/client-bookings');

    } catch (error) {
      console.error('Error handling payment success:', error);
      toast.error('Payment successful but encountered an error. Please contact support.');
    }
  };

  const handlePaymentPending = (result: any) => {
    toast.success('Payment pending. Please complete the payment.');
  };

  const handlePaymentError = (result: any) => {
    toast.error('Payment failed. Please try again.');
  };

  const handlePaymentClose = () => {
    setPaymentToken(null);
  };

  const isHourSelected = (hour: string) => selectedHours.includes(hour);

  const getStatusInfo = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'Menunggu streamer menerima pesanan Anda. Biasanya membutuhkan waktu 15-60 menit untuk konfirmasi.';
      case 'accepted':
        return 'Pesanan Anda telah diterima oleh streamer. Silakan tunggu link streaming yang akan diberikan saat waktu yang ditentukan.';
      case 'completed':
        return 'Sesi streaming telah selesai. Terima kasih telah menggunakan layanan kami.';
      case 'rejected':
        return 'Maaf, streamer tidak dapat menerima pesanan Anda. Silakan coba waktu lain atau streamer lainnya.';
      case 'live':
        return 'Sesi streaming sedang berlangsung.';
      default:
        return '';
    }
  };

  if (!bookingDetails) {
    return <div className="container mx-auto p-4">Loading...</div>;
  }

  const subtotal = bookingDetails.price * selectedHours.length;
  const platformFee = subtotal * 0.30;
  const subtotalWithPlatformFee = subtotal + platformFee;
  const tax = subtotalWithPlatformFee * 0.11;
  const total = Math.round(subtotalWithPlatformFee + tax);

  return (
    <>
      <Navbar />
      <div className="container mx-auto p-4 max-w-6xl font-sans text-sm mt-8">
        <div className="flex items-center gap-6 mb-8">
          <ChevronLeft 
            className="h-6 w-6 text-red-500 cursor-pointer hover:text-red-600 transition-colors"
            onClick={() => router.push('/protected')}
          />
          <h1 className="text-2xl">Detail Pemesanan</h1>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Left Container */}
          <div className="flex-1 space-y-6">
            <div className="border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl mb-6">Informasi Pemesanan</h2>
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-red-500" />
                  <span className="text-base">
                    {format(new Date(bookingDetails?.date || ''), 'MMMM d, yyyy')}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-red-500" />
                  <span className="text-base">
                    {selectedHours.length > 0 && (
                      `${selectedHours[0]} - ${format(addHours(parseISO(`${bookingDetails?.date}T${selectedHours[selectedHours.length - 1]}`), 1), 'HH:mm')} (${differenceInHours(
                        addHours(parseISO(`${bookingDetails?.date}T${selectedHours[selectedHours.length - 1]}`), 1),
                        parseISO(`${bookingDetails?.date}T${selectedHours[0]}`)
                      )} jam)`
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Monitor className="h-5 w-5 text-red-500" />
                  <span className="text-base">{bookingDetails?.platform}</span>
                </div>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl mb-4">Permintaan Khusus</h2>
              <Textarea
                id="special-request"
                placeholder="Ada permintaan khusus untuk streamer?"
                value={specialRequest}
                onChange={(e) => setSpecialRequest(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>

            {bookingDetails?.platform.toLowerCase() === 'shopee' ? (
              <div className="border border-gray-200 rounded-lg p-6">
                <h2 className="text-xl mb-2 flex items-center gap-2">
                  Sub Account Link 
                  <Badge className="bg-gradient-to-r from-orange-500 to-orange-600 text-white border-0">
                    Shopee
                  </Badge>
                </h2>
                <Input 
                  placeholder="Masukkan link sub account Shopee" 
                  className="mt-1 text-sm"
                  value={subAccountLink}
                  onChange={(e) => setSubAccountLink(e.target.value)}
                />
              </div>
            ) : bookingDetails?.platform.toLowerCase() === 'tiktok' ? (
              <div className="border border-gray-200 rounded-lg p-6">
                <h2 className="text-xl mb-2 flex items-center gap-2">
                  Nomor Telepon 
                  <Badge className="bg-gradient-to-r from-[#00f2ea] to-[#ff0050] text-white border-0">
                    TikTok
                  </Badge>
                </h2>
                <div className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-red-500" />
                  <Input 
                    type="tel"
                    placeholder="Masukkan nomor telepon Anda" 
                    className="mt-1 text-sm"
                    value={subAccountLink}
                    onChange={(e) => setSubAccountLink(e.target.value)}
                  />
                </div>
                <p className="mt-3 text-sm text-gray-600 border border-blue-100 p-3 rounded-lg">
                  Mohon berkoordinasi dengan streamer dan siap menerima OTP yang akan dibagikan ke streamer dalam waktu 1-5 menit
                </p>
              </div>
            ) : null}

            <div className="border border-gray-200 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-1" />
                <div>
                  <h2 className="text-xl mb-2">Kebijakan Pembatalan</h2>
                  <p className="text-sm text-gray-600">
                    Pembatalan gratis hingga 24 jam sebelum pemesanan. Setelah itu, biaya 50% akan dikenakan.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Container */}
          <div className="w-full md:w-1/3">
            <div className="border border-gray-200 rounded-lg p-6 sticky top-4">
              <p className="text-sm text-gray-500 mb-2">Informasi Streamer</p>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl">{bookingDetails?.streamerName}</h2>
                  <div className="bg-blue-50 p-1 rounded-full">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  </div>
                </div>
                <div className="flex items-center bg-yellow-50 px-3 py-2 rounded-lg">
                  <Star className="w-5 h-5 text-yellow-400 fill-current" />
                  <span className="ml-1 text-lg">{bookingDetails?.rating.toFixed(1)}</span>
                </div>
              </div>

              <div className="flex items-center text-base text-gray-600 mb-4">
                <MapPin className="h-5 w-5 text-red-500 mr-2" />
                <span>{bookingDetails?.location}</span>
              </div>

              <hr className="border-t border-gray-200 my-6" />

              <div className="space-y-4">
                <div className="flex justify-between text-base">
                  <span className="text-gray-600">{`Rp ${bookingDetails?.price.toLocaleString()} x ${selectedHours.length} jam`}</span>
                  <span>{`Rp ${subtotal.toLocaleString()}`}</span>
                </div>
                <div className="flex justify-between text-base">
                  <span className="text-gray-600">Biaya platform (30%)</span>
                  <span>{`Rp ${platformFee.toLocaleString()}`}</span>
                </div>
                <div className="flex justify-between text-base">
                  <span className="text-gray-600">Pajak (11%)</span>
                  <span>{`Rp ${tax.toLocaleString()}`}</span>
                </div>
              </div>

              <hr className="border-t border-gray-200 my-6" />

              <div className="flex justify-between text-xl mb-8">
                <span>Total</span>
                <span>{`Rp ${total.toLocaleString()}`}</span>
              </div>

              <div className="pt-4">
                <Button 
                  onClick={handleConfirmBooking} 
                  disabled={isLoading}
                  className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-4 rounded-lg text-lg transition-colors duration-200"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                      Memproses...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-6 w-6" />
                      Bayar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {paymentToken && (
          <PaymentModal
            token={paymentToken}
            onSuccess={handlePaymentSuccess}
            onPending={handlePaymentPending}
            onError={handlePaymentError}
            onClose={handlePaymentClose}
          />
        )}
      </div>
    </>
  );
}