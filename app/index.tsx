import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  ImageBackground,
  Animated,
  PanGestureHandler,
  State,
  SafeAreaView,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import { Audio, Video, ResizeMode } from 'expo-av';

const { width, height } = Dimensions.get('window');

interface MediaItem {
  id: string;
  filename: string;
  uri: string;
  mediaType: 'video' | 'audio';
  duration: number;
  creationTime: number;
}

type MediaFilter = 'all' | 'video' | 'audio';

export default function ClassicMediaPlayer() {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [showSidebar, setShowSidebar] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const videoRef = useRef<Video>(null);
  const audioRef = useRef<Audio.Sound | null>(null);
  const sidebarAnimation = useRef(new Animated.Value(-width * 0.7)).current;
  const panRef = useRef<PanGestureHandler>(null);

  // طلب الأذونات وتحميل الوسائط
  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        setPermissionGranted(true);
        loadMediaFiles();
      } else {
        Alert.alert(
          'الأذونات مطلوبة',
          'يحتاج التطبيق للوصول إلى ملفات الوسائط لتشغيلها',
          [
            { text: 'إلغاء', style: 'cancel' },
            { text: 'الإعدادات', onPress: () => Linking.openSettings() }
          ]
        );
      }
    } catch (error) {
      console.error('خطأ في طلب الأذونات:', error);
    }
  };

  const loadMediaFiles = async () => {
    try {
      const media = await MediaLibrary.getAssetsAsync({
        mediaType: [MediaLibrary.MediaType.video, MediaLibrary.MediaType.audio],
        first: 1000,
        sortBy: MediaLibrary.SortBy.creationTime,
      });

      const formattedMedia: MediaItem[] = media.assets.map(asset => ({
        id: asset.id,
        filename: asset.filename,
        uri: asset.uri,
        mediaType: asset.mediaType === MediaLibrary.MediaType.video ? 'video' : 'audio',
        duration: asset.duration,
        creationTime: asset.creationTime,
      }));

      setMediaItems(formattedMedia);
    } catch (error) {
      console.error('خطأ في تحميل الملفات:', error);
    }
  };

  // تصفية الوسائط حسب النوع
  const filteredMedia = mediaItems.filter(item => {
    if (mediaFilter === 'all') return true;
    return item.mediaType === mediaFilter;
  });

  const currentMedia = filteredMedia[currentIndex];

  // التحكم في التشغيل
  const togglePlayback = async () => {
    if (!currentMedia) return;

    try {
      if (currentMedia.mediaType === 'video' && videoRef.current) {
        if (isPlaying) {
          await videoRef.current.pauseAsync();
        } else {
          await videoRef.current.playAsync();
        }
      } else if (currentMedia.mediaType === 'audio') {
        if (audioRef.current) {
          if (isPlaying) {
            await audioRef.current.pauseAsync();
          } else {
            await audioRef.current.playAsync();
          }
        } else {
          const { sound } = await Audio.loadAsync({ uri: currentMedia.uri });
          audioRef.current = sound;
          await sound.playAsync();
        }
      }
      setIsPlaying(!isPlaying);
    } catch (error) {
      console.error('خطأ في التشغيل:', error);
    }
  };

  // التنقل بين الملفات
  const navigateMedia = (direction: 'up' | 'down') => {
    const newIndex = direction === 'up' 
      ? Math.max(0, currentIndex - 1)
      : Math.min(filteredMedia.length - 1, currentIndex + 1);
    
    setCurrentIndex(newIndex);
    setIsPlaying(false);
    
    // إيقاف الصوت الحالي
    if (audioRef.current) {
      audioRef.current.unloadAsync();
      audioRef.current = null;
    }
  };

  // التحكم في الشريط الجانبي
  const toggleSidebar = () => {
    const toValue = showSidebar ? -width * 0.7 : 0;
    Animated.timing(sidebarAnimation, {
      toValue,
      duration: 300,
      useNativeDriver: true,
    }).start();
    setShowSidebar(!showSidebar);
  };

  // معالج الإيماءات
  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: sidebarAnimation } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const { translationX, velocityX } = event.nativeEvent;
      
      if (translationX > 50 || velocityX > 500) {
        // السحب لليسار - إظهار القائمة
        toggleSidebar();
      } else if (translationX < -50 || velocityX < -500) {
        // السحب لليمين - إخفاء القائمة
        if (showSidebar) toggleSidebar();
      } else {
        // العودة للموضع الأصلي
        Animated.spring(sidebarAnimation, {
          toValue: showSidebar ? 0 : -width * 0.7,
          useNativeDriver: true,
        }).start();
      }
    }
  };

  // إحصائيات الوسائط
  const getMediaCount = (type: MediaFilter) => {
    if (type === 'all') return mediaItems.length;
    return mediaItems.filter(item => item.mediaType === type).length;
  };

  // تنسيق الوقت
  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!permissionGranted) {
    return (
      <ImageBackground
        source={{ uri: 'https://firebasestorage.googleapis.com/v0/b/blink-451505.firebasestorage.app/o/user-uploads%2Fvz6iCIjvwxf21wyGR5vxHRW1Jkp1%2Fimg_3_1752171517284__a46e8665.jpg?alt=media&token=ce84f53f-7640-4564-b707-f7b552fb3c6e' }}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
          <Ionicons name="musical-notes" size={80} color="#4299E1" style={{ marginBottom: 20 }} />
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: 'white', textAlign: 'center', marginBottom: 10 }}>
            مشغل الوسائط الكلاسيكي
          </Text>
          <Text style={{ fontSize: 16, color: '#E2E8F0', textAlign: 'center', marginBottom: 30 }}>
            يحتاج التطبيق للوصول إلى ملفات الوسائط لتشغيلها
          </Text>
          <TouchableOpacity
            onPress={requestPermissions}
            style={{
              backgroundColor: '#4299E1',
              paddingHorizontal: 30,
              paddingVertical: 15,
              borderRadius: 25,
              elevation: 5,
            }}
          >
            <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>
              منح الأذونات
            </Text>
          </TouchableOpacity>
        </View>
      </ImageBackground>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* الخلفية الرئيسية */}
      <ImageBackground
        source={{ uri: 'https://firebasestorage.googleapis.com/v0/b/blink-451505.firebasestorage.app/o/user-uploads%2Fvz6iCIjvwxf21wyGR5vxHRW1Jkp1%2Fimg_3_1752171517284__a46e8665.jpg?alt=media&token=ce84f53f-7640-4564-b707-f7b552fb3c6e' }}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}>
          
          {/* منطقة المحتوى الرئيسية */}
          <PanGestureHandler
            ref={panRef}
            onGestureEvent={onGestureEvent}
            onHandlerStateChange={onHandlerStateChange}
          >
            <Animated.View style={{ flex: 1 }}>
              
              {/* مشغل الوسائط */}
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                
                {currentMedia ? (
                  <>
                    {/* عرض الفيديو */}
                    {currentMedia.mediaType === 'video' ? (
                      <Video
                        ref={videoRef}
                        source={{ uri: currentMedia.uri }}
                        style={{ width: width - 40, height: height * 0.6, borderRadius: 15 }}
                        resizeMode={ResizeMode.CONTAIN}
                        shouldPlay={isPlaying}
                        isLooping={false}
                        onPlaybackStatusUpdate={(status: any) => {
                          if (status.isLoaded) {
                            setPosition(status.positionMillis || 0);
                            setDuration(status.durationMillis || 0);
                          }
                        }}
                      />
                    ) : (
                      /* عرض الموسيقى */
                      <View style={{
                        width: width - 40,
                        height: height * 0.6,
                        borderRadius: 15,
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderWidth: 2,
                        borderColor: 'rgba(255,255,255,0.3)',
                      }}>
                        <Ionicons name="musical-notes" size={120} color="#4299E1" />
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold', marginTop: 20, textAlign: 'center' }}>
                          {currentMedia.filename}
                        </Text>
                      </View>
                    )}

                    {/* عناصر التحكم */}
                    <View style={{ marginTop: 30, alignItems: 'center' }}>
                      
                      {/* شريط التقدم */}
                      <View style={{ width: width - 60, marginBottom: 20 }}>
                        <View style={{
                          height: 4,
                          backgroundColor: 'rgba(255,255,255,0.3)',
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}>
                          <View style={{
                            height: '100%',
                            width: `${duration > 0 ? (position / duration) * 100 : 0}%`,
                            backgroundColor: '#4299E1',
                          }} />
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
                          <Text style={{ color: '#E2E8F0', fontSize: 12 }}>
                            {formatTime(position)}
                          </Text>
                          <Text style={{ color: '#E2E8F0', fontSize: 12 }}>
                            {formatTime(duration)}
                          </Text>
                        </View>
                      </View>

                      {/* أزرار التحكم */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 30 }}>
                        <TouchableOpacity
                          onPress={() => navigateMedia('up')}
                          style={{
                            width: 50,
                            height: 50,
                            borderRadius: 25,
                            backgroundColor: 'rgba(255,255,255,0.2)',
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          <Ionicons name="play-skip-back" size={24} color="white" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={togglePlayback}
                          style={{
                            width: 70,
                            height: 70,
                            borderRadius: 35,
                            backgroundColor: '#4299E1',
                            justifyContent: 'center',
                            alignItems: 'center',
                            elevation: 5,
                          }}
                        >
                          <Ionicons 
                            name={isPlaying ? "pause" : "play"} 
                            size={32} 
                            color="white" 
                          />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => navigateMedia('down')}
                          style={{
                            width: 50,
                            height: 50,
                            borderRadius: 25,
                            backgroundColor: 'rgba(255,255,255,0.2)',
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          <Ionicons name="play-skip-forward" size={24} color="white" />
                        </TouchableOpacity>
                      </View>

                      {/* معلومات الملف */}
                      <Text style={{ 
                        color: 'white', 
                        fontSize: 16, 
                        fontWeight: 'bold', 
                        marginTop: 20,
                        textAlign: 'center' 
                      }}>
                        {currentMedia.filename}
                      </Text>
                      <Text style={{ 
                        color: '#E2E8F0', 
                        fontSize: 14, 
                        marginTop: 5,
                        textAlign: 'center' 
                      }}>
                        {currentIndex + 1} من {filteredMedia.length} • {currentMedia.mediaType === 'video' ? 'فيديو' : 'موسيقى'}
                      </Text>
                    </View>
                  </>
                ) : (
                  /* لا توجد ملفات */
                  <View style={{ alignItems: 'center' }}>
                    <Ionicons name="folder-open-outline" size={80} color="#4299E1" />
                    <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold', marginTop: 20 }}>
                      لا توجد ملفات وسائط
                    </Text>
                    <Text style={{ color: '#E2E8F0', fontSize: 14, marginTop: 10, textAlign: 'center' }}>
                      تأكد من وجود ملفات فيديو أو موسيقى في هاتفك
                    </Text>
                  </View>
                )}
              </View>

              {/* مؤشر السحب */}
              <View style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: [{ translateY: -15 }],
                backgroundColor: 'rgba(255,255,255,0.2)',
                paddingHorizontal: 8,
                paddingVertical: 15,
                borderRadius: 20,
              }}>
                <Ionicons name="chevron-forward" size={20} color="white" />
              </View>

            </Animated.View>
          </PanGestureHandler>

          {/* الشريط الجانبي */}
          <Animated.View style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: width * 0.7,
            backgroundColor: 'rgba(0,0,0,0.95)',
            transform: [{ translateX: sidebarAnimation }],
            zIndex: 1000,
          }}>
            <SafeAreaView style={{ flex: 1, padding: 20 }}>
              
              {/* رأس القائمة */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
                <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold' }}>
                  مكتبة الوسائط
                </Text>
                <TouchableOpacity onPress={toggleSidebar}>
                  <Ionicons name="close" size={24} color="white" />
                </TouchableOpacity>
              </View>

              {/* خيارات التصفية */}
              <View style={{ gap: 15 }}>
                
                {/* جميع الوسائط */}
                <TouchableOpacity
                  onPress={() => {
                    setMediaFilter('all');
                    setCurrentIndex(0);
                    toggleSidebar();
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: mediaFilter === 'all' ? 'rgba(66, 153, 225, 0.3)' : 'rgba(255,255,255,0.1)',
                    padding: 15,
                    borderRadius: 12,
                    borderWidth: mediaFilter === 'all' ? 2 : 0,
                    borderColor: '#4299E1',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Ionicons name="library" size={24} color="#4299E1" />
                    <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                      جميع الوسائط
                    </Text>
                  </View>
                  <View style={{
                    backgroundColor: '#4299E1',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 12,
                  }}>
                    <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
                      {getMediaCount('all')}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* الفيديوهات */}
                <TouchableOpacity
                  onPress={() => {
                    setMediaFilter('video');
                    setCurrentIndex(0);
                    toggleSidebar();
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: mediaFilter === 'video' ? 'rgba(66, 153, 225, 0.3)' : 'rgba(255,255,255,0.1)',
                    padding: 15,
                    borderRadius: 12,
                    borderWidth: mediaFilter === 'video' ? 2 : 0,
                    borderColor: '#4299E1',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Ionicons name="videocam" size={24} color="#E53E3E" />
                    <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                      الفيديوهات
                    </Text>
                  </View>
                  <View style={{
                    backgroundColor: '#E53E3E',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 12,
                  }}>
                    <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
                      {getMediaCount('video')}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* الموسيقى */}
                <TouchableOpacity
                  onPress={() => {
                    setMediaFilter('audio');
                    setCurrentIndex(0);
                    toggleSidebar();
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: mediaFilter === 'audio' ? 'rgba(66, 153, 225, 0.3)' : 'rgba(255,255,255,0.1)',
                    padding: 15,
                    borderRadius: 12,
                    borderWidth: mediaFilter === 'audio' ? 2 : 0,
                    borderColor: '#4299E1',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Ionicons name="musical-notes" size={24} color="#38A169" />
                    <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
                      الموسيقى
                    </Text>
                  </View>
                  <View style={{
                    backgroundColor: '#38A169',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 12,
                  }}>
                    <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
                      {getMediaCount('audio')}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* معلومات إضافية */}
              <View style={{ marginTop: 40, padding: 15, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>
                <Text style={{ color: '#4299E1', fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>
                  كيفية الاستخدام:
                </Text>
                <Text style={{ color: '#E2E8F0', fontSize: 12, lineHeight: 18 }}>
                  • السحب للأعلى والأسفل للتنقل بين الملفات{'\n'}
                  • السحب لليسار لإظهار هذه القائمة{'\n'}
                  • النقر على الشاشة للتشغيل/الإيقاف
                </Text>
              </View>

            </SafeAreaView>
          </Animated.View>

          {/* طبقة تغطية عند فتح القائمة */}
          {showSidebar && (
            <TouchableOpacity
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                zIndex: 999,
              }}
              onPress={toggleSidebar}
              activeOpacity={1}
            />
          )}

        </View>
      </ImageBackground>
    </View>
  );
}