"use client";

import { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateUserProfile, updateStreamerProfile } from "@/app/actions";
import { createClient } from "@/utils/supabase/client";
import Image from 'next/image';
import { Loader2, User, Mail, FileText, Camera, Youtube, AlertCircle, ChevronLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB in bytes

// First, let's define the response types at the top of the file
interface StreamerProfileResponse {
  success: boolean;
  message?: string;
  imageUrl?: string;
  redirect?: string;
  error?: string;
}

interface UserProfileResponse {
  success: boolean;
  profilePictureUrl?: string;
  error?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState('');
  const [userType, setUserType] = useState<'client' | 'streamer' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);
  const [newGalleryPhotos, setNewGalleryPhotos] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false); // New state for loading

  const fetchUserData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('first_name, last_name, bio, profile_picture_url, user_type')
        .eq('id', user.id)
        .single();

      if (userData && !userError) {
        setFirstName(userData.first_name || '');
        setLastName(userData.last_name || '');
        setBio(userData.bio || '');
        setUserType(userData.user_type);

        if (userData.user_type === 'streamer') {
          const { data: streamerData, error: streamerError } = await supabase
            .from('streamers')
            .select('id, image_url, video_url')
            .eq('user_id', user.id)
            .single();

          if (streamerData && !streamerError) {
            setImageUrl(streamerData.image_url || '');
            setYoutubeUrl(streamerData.video_url || '');

            // Fetch gallery photos
            const { data: galleryData, error: galleryError } = await supabase
              .from('streamer_gallery_photos')
              .select('photo_url')
              .eq('streamer_id', streamerData.id)
              .order('order_number');

            if (galleryData && !galleryError) {
              setGalleryPhotos(galleryData.map(item => item.photo_url));
            }
          }
        } else {
          setImageUrl(userData.profile_picture_url || '');
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUserData();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    
    try {
      if (selectedImage) {
        formData.append('image', selectedImage);
      }
      
      if (userType === 'streamer') {
        formData.append('youtubeUrl', youtubeUrl);
        newGalleryPhotos.forEach((photo) => {
          formData.append('galleryPhoto', photo);
        });
      }

      const result = userType === 'streamer' 
        ? await updateStreamerProfile(formData)
        : await updateUserProfile(formData);

      if ('error' in result) {
        toast.error(result.error);
        return;
      }

      // Show success message
      toast.success(
        'message' in result 
          ? result.message 
          : 'Profile updated successfully!'
      );

      // Clear temporary states
      setPreviewUrl(null);
      setSelectedImage(null);
      setNewGalleryPhotos([]);

      // Handle redirect if provided
      if ('redirect' in result && result.redirect) {
        router.push(result.redirect);
      } else {
        // Fetch updated data if not redirecting
        await fetchUserData();
      }

    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        setImageError('Image size exceeds 1MB. Please choose a smaller image.');
        return;
      }
      setImageError('');
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleGalleryPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newPhotos = Array.from(files).slice(0, 5 - galleryPhotos.length);
      setNewGalleryPhotos(prevPhotos => [...prevPhotos, ...newPhotos]);
    }
  };

  const removeGalleryPhoto = (index: number) => {
    setGalleryPhotos(prevPhotos => prevPhotos.filter((_, i) => i !== index));
  };

  const removeNewGalleryPhoto = (index: number) => {
    setNewGalleryPhotos(prevPhotos => prevPhotos.filter((_, i) => i !== index));
  };

  const handleBackNavigation = () => {
    if (userType === 'streamer') {
      router.push('/streamer-dashboard');
    } else {
      router.push('/protected');
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-[#000080]" />
    </div>;
  }

  const inputClasses = "focus:border-[#000080] focus:ring-[#000080]";

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <div className="flex items-center mb-6">
        <Button 
          onClick={handleBackNavigation} 
          variant="outline" 
          size="sm" 
          className="mr-4"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">{userType === 'streamer' ? 'Streamer' : 'Client'} Settings</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Profile Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col items-center mb-6">
              <div className="relative w-32 h-32 mb-2">
                {previewUrl || imageUrl ? (
                  <Image
                    src={previewUrl || imageUrl}
                    alt="Profile"
                    width={128}
                    height={128}
                    className="w-full h-full rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full bg-gray-200 rounded-full flex items-center justify-center">
                    <User className="h-12 w-12 text-gray-400" />
                  </div>
                )}
              </div>
              <Button type="button" onClick={handleImageClick} className="mt-2 flex items-center">
                <Camera className="mr-2 h-4 w-4" />
                {imageUrl ? 'Change Image' : 'Upload Image'}
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageChange}
                className="hidden"
                accept="image/*"
              />
              {imageError && <p className="text-red-500 text-sm mt-2 flex items-center"><AlertCircle className="mr-1 h-4 w-4" />{imageError}</p>}
            </div>
            <div>
              <Label htmlFor="firstName" className="flex items-center">
                <User className="mr-2 h-4 w-4" />
                First Name
              </Label>
              <Input
                id="firstName"
                name="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Your first name"
                className={inputClasses}
              />
            </div>
            <div>
              <Label htmlFor="lastName" className="flex items-center">
                <User className="mr-2 h-4 w-4" />
                Last Name
              </Label>
              <Input
                id="lastName"
                name="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Your last name"
                className={inputClasses}
              />
            </div>
            <div>
              <Label htmlFor="bio" className="flex items-center">
                <FileText className="mr-2 h-4 w-4" />
                Bio
              </Label>
              <Textarea
                id="bio"
                name="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about yourself"
                className={inputClasses}
              />
              <p className="text-sm text-gray-500 mt-1">Tip: A good bio helps others understand you better.</p>
            </div>
            {userType === 'streamer' && (
              <>
                <div>
                  <Label htmlFor="youtubeUrl" className="flex items-center">
                    <Youtube className="mr-2 h-4 w-4" />
                    YouTube Video URL
                  </Label>
                  <Input
                    id="youtubeUrl"
                    name="youtubeUrl"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://youtu.be/..."
                    className={inputClasses}
                  />
                  <p className="text-sm text-gray-500 mt-1">Add a video to showcase your streaming style.</p>
                </div>
                <div>
                  <Label htmlFor="galleryPhotos" className="flex items-center">
                    <Camera className="mr-2 h-4 w-4" />
                    Gallery Photos (Max 5)
                  </Label>
                  <Input
                    id="galleryPhotos"
                    name="galleryPhotos"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleGalleryPhotoChange}
                    className={inputClasses}
                    disabled={galleryPhotos.length + newGalleryPhotos.length >= 5}
                  />
                  <p className="text-sm text-gray-500 mt-1">Tip: Choose photos that represent your brand and style.</p>
                  <div className="grid grid-cols-5 gap-2 mt-2">
                    {galleryPhotos.map((photo, index) => (
                      <div key={index} className="relative">
                        <Image
                          src={photo}
                          alt={`Gallery photo ${index + 1}`}
                          width={100}
                          height={100}
                          className="w-full h-24 object-cover rounded"
                        />
                        <button
                          type="button"
                          onClick={() => removeGalleryPhoto(index)}
                          className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-1"
                        >
                          X
                        </button>
                      </div>
                    ))}
                    {newGalleryPhotos.map((photo, index) => (
                      <div key={`new-${index}`} className="relative">
                        <Image
                          src={URL.createObjectURL(photo)}
                          alt={`New gallery photo ${index + 1}`}
                          width={100}
                          height={100}
                          className="w-full h-24 object-cover rounded"
                        />
                        <button
                          type="button"
                          onClick={() => removeNewGalleryPhoto(index)}
                          className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-1"
                        >
                          X
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            <Button 
              type="submit" 
              className="h-10 bg-[#000080] text-white hover:bg-[#000060] w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}