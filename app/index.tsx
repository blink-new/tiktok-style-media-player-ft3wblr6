import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  StatusBar,
  Text,
  TouchableOpacity,
  Image,
  ImageBackground,
  Animated,
  PanResponder,
  Alert,
  Platform,
} from 'react-native';
import { Video, Audio, AVPlaybackStatus } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import { Play, Pause, Heart, Share, Volume2, VolumeX, Music, Film, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MediaItem {
  id: string;
  uri: string;
  filename: string;
  mediaType: 'video' | 'audio';
  duration: number;
}

type MediaFilter = 'all' | 'video' | 'audio';

export default function MediaPlayer() {
  const [allMediaItems, setAllMediaItems] = useState<MediaItem[]>([]);
  const [filteredMediaItems, setFilteredMediaItems] = useState<MediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const videoRef = useRef<Video>(null);
  const audioRef = useRef<Audio.Sound | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const filterMenuOpacity = useRef(new Animated.Value(0)).current;
  const filterMenuTranslateX = useRef(new Animated.Value(-200)).current;

  // Profile image URL - using a default placeholder
  const profileImageUri = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop&crop=face';

  // Sample media data (in real app, this would come from MediaLibrary)
  const sampleMedia: MediaItem[] = [
    {
      id: '1',
      uri: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      filename: 'Big Buck Bunny',
      mediaType: 'video',
      duration: 596,
    },
    {
      id: '2',
      uri: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav',
      filename: 'Beautiful Music',
      mediaType: 'audio',
      duration: 180,
    },
    {
      id: '3',
      uri: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      filename: 'Elephants Dream',
      mediaType: 'video',
      duration: 653,
    },
    {
      id: '4',
      uri: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav',
      filename: 'Relaxing Sounds',
      mediaType: 'audio',
      duration: 240,
    },
    {
      id: '5',
      uri: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      filename: 'For Bigger Blazes',
      mediaType: 'video',
      duration: 15,
    },
  ];

  // Pan responder for swipe gestures
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const { dx, dy } = gestureState;
        // Horizontal swipe for filter menu
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
          return true;
        }
        // Vertical swipe for media navigation
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
          return true;
        }
        return false;
      },
      onPanResponderMove: (_, gestureState) => {
        const { dx, dy } = gestureState;
        
        if (Math.abs(dx) > Math.abs(dy)) {
          // Horizontal swipe - show filter menu
          if (dx > 0 && dx < 200) {
            translateX.setValue(dx);
          }
        } else {
          // Vertical swipe - navigate media
          translateY.setValue(dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dx, dy, vx, vy } = gestureState;
        
        if (Math.abs(dx) > Math.abs(dy)) {
          // Horizontal swipe
          if (dx > 50 || vx > 0.5) {
            // Show filter menu
            showFilterMenuAnimated();
          } else {
            // Hide filter menu
            hideFilterMenuAnimated();
          }
        } else {
          // Vertical swipe
          if (Math.abs(dy) > 50 || Math.abs(vy) > 0.5) {
            if (dy < 0) {
              // Swipe up - next media
              goToNext();
            } else {
              // Swipe down - previous media
              goToPrevious();
            }
          }
        }
        
        // Reset positions
        Animated.parallel([
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }),
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }),
        ]).start();
      },
    })
  ).current;

  useEffect(() => {
    loadMedia();
    setupAudio();
  }, []);

  useEffect(() => {
    filterMedia();
  }, [allMediaItems, mediaFilter]);

  useEffect(() => {
    if (filteredMediaItems.length > 0) {
      playCurrentMedia();
    }
  }, [currentIndex, filteredMediaItems]);

  // Auto-hide controls
  useEffect(() => {
    const timer = setTimeout(() => {
      if (showControls && isPlaying && !showFilterMenu) {
        hideControls();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [showControls, isPlaying, showFilterMenu]);

  const setupAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      console.log('Audio setup error:', error);
    }
  };

  const loadMedia = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        // Load actual media from device
        const mediaAssets = await MediaLibrary.getAssetsAsync({
          mediaType: [MediaLibrary.MediaType.video, MediaLibrary.MediaType.audio],
          first: 100,
          sortBy: MediaLibrary.SortBy.creationTime,
        });

        const deviceMedia: MediaItem[] = mediaAssets.assets.map((asset, index) => ({
          id: asset.id,
          uri: asset.uri,
          filename: asset.filename,
          mediaType: asset.mediaType === MediaLibrary.MediaType.video ? 'video' : 'audio',
          duration: asset.duration,
        }));

        // Combine device media with sample media for demo
        const combinedMedia = [...deviceMedia, ...sampleMedia];
        setAllMediaItems(combinedMedia);
      } else {
        // Show permission alert
        Alert.alert(
          'إذن مطلوب',
          'يحتاج التطبيق إلى إذن للوصول إلى ملفات الوسائط في جهازك لتشغيل الفيديوهات والموسيقى.',
          [
            { text: 'إلغاء', style: 'cancel' },
            { text: 'إعدادات', onPress: () => MediaLibrary.requestPermissionsAsync() },
          ]
        );
        // Use sample data if permission denied
        setAllMediaItems(sampleMedia);
      }
    } catch (error) {
      console.log('Media loading error:', error);
      setAllMediaItems(sampleMedia);
    } finally {
      setIsLoading(false);
    }
  };

  const filterMedia = () => {
    let filtered = allMediaItems;
    
    if (mediaFilter === 'video') {
      filtered = allMediaItems.filter(item => item.mediaType === 'video');
    } else if (mediaFilter === 'audio') {
      filtered = allMediaItems.filter(item => item.mediaType === 'audio');
    }
    
    setFilteredMediaItems(filtered);
    setCurrentIndex(0); // Reset to first item when filter changes
  };

  const playCurrentMedia = async () => {
    if (filteredMediaItems.length === 0) return;

    const currentMedia = filteredMediaItems[currentIndex];
    
    try {
      // Stop previous audio if exists
      if (audioRef.current) {
        await audioRef.current.unloadAsync();
        audioRef.current = null;
      }

      if (currentMedia.mediaType === 'video') {
        // Video will be handled by Video component
        setIsPlaying(true);
      } else {
        // Load and play audio
        const { sound } = await Audio.Sound.createAsync(
          { uri: currentMedia.uri },
          { shouldPlay: true, isLooping: false }
        );
        audioRef.current = sound;
        setIsPlaying(true);

        sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
          if (status.isLoaded) {
            setPlaybackPosition(status.positionMillis || 0);
            setPlaybackDuration(status.durationMillis || 0);
            setIsPlaying(status.isPlaying);
          }
        });
      }
    } catch (error) {
      console.log('Playback error:', error);
    }
  };

  const togglePlayPause = async () => {
    const currentMedia = filteredMediaItems[currentIndex];
    
    if (currentMedia.mediaType === 'video' && videoRef.current) {
      if (isPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        await videoRef.current.playAsync();
      }
    } else if (audioRef.current) {
      if (isPlaying) {
        await audioRef.current.pauseAsync();
      } else {
        await audioRef.current.playAsync();
      }
    }
  };

  const goToNext = () => {
    if (currentIndex < filteredMediaItems.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setCurrentIndex(0); // Loop back to first
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else {
      setCurrentIndex(filteredMediaItems.length - 1); // Loop to last
    }
  };

  const toggleMute = async () => {
    const currentMedia = filteredMediaItems[currentIndex];
    
    if (currentMedia.mediaType === 'video' && videoRef.current) {
      await videoRef.current.setIsMutedAsync(!isMuted);
    } else if (audioRef.current) {
      await audioRef.current.setVolumeAsync(isMuted ? 1.0 : 0.0);
    }
    setIsMuted(!isMuted);
  };

  const showControlsTemporarily = () => {
    setShowControls(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const hideControls = () => {
    Animated.timing(controlsOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowControls(false);
    });
  };

  const showFilterMenuAnimated = () => {
    setShowFilterMenu(true);
    Animated.parallel([
      Animated.timing(filterMenuOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(filterMenuTranslateX, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const hideFilterMenuAnimated = () => {
    Animated.parallel([
      Animated.timing(filterMenuOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(filterMenuTranslateX, {
        toValue: -200,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowFilterMenu(false);
    });
  };

  const handleFilterChange = (filter: MediaFilter) => {
    setMediaFilter(filter);
    hideFilterMenuAnimated();
  };

  const handleScreenTap = () => {
    if (showFilterMenu) {
      hideFilterMenuAnimated();
    } else if (showControls) {
      hideControls();
    } else {
      showControlsTemporarily();
    }
  };

  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getFilterTitle = () => {
    switch (mediaFilter) {
      case 'video': return 'الفيديوهات';
      case 'audio': return 'الموسيقى';
      default: return 'جميع الوسائط';
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Image source={profileImageUri} style={styles.loadingImage} />
        <Text style={styles.loadingText}>جاري تحميل الوسائط...</Text>
      </View>
    );
  }

  if (filteredMediaItems.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Image source={profileImageUri} style={styles.emptyImage} />
        <Text style={styles.emptyText}>لا توجد ملفات وسائط</Text>
        <Text style={styles.emptySubtext}>
          {mediaFilter === 'video' ? 'لا توجد فيديوهات' : 
           mediaFilter === 'audio' ? 'لا توجد ملفات صوتية' : 
           'لا توجد ملفات وسائط'}
        </Text>
        <TouchableOpacity 
          style={styles.changeFilterButton}
          onPress={() => setMediaFilter('all')}
        >
          <Text style={styles.changeFilterText}>عرض جميع الوسائط</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentMedia = filteredMediaItems[currentIndex];

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      <Animated.View
        style={[
          styles.mediaContainer,
          {
            transform: [{ translateY }, { translateX }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {currentMedia.mediaType === 'video' ? (
          <View style={styles.videoContainer}>
            <Video
              ref={videoRef}
              source={{ uri: currentMedia.uri }}
              style={styles.video}
              shouldPlay={isPlaying}
              isLooping={false}
              isMuted={isMuted}
              resizeMode="cover"
              onPlaybackStatusUpdate={(status: AVPlaybackStatus) => {
                if (status.isLoaded) {
                  setPlaybackPosition(status.positionMillis || 0);
                  setPlaybackDuration(status.durationMillis || 0);
                  setIsPlaying(status.isPlaying);
                }
              }}
            />
            <LinearGradient
              colors={['transparent', 'transparent', 'rgba(0,0,0,0.3)']}
              style={styles.videoOverlay}
            />
          </View>
        ) : (
          <ImageBackground
            source={profileImageUri}
            style={styles.audioBackground}
            resizeMode="cover"
            blurRadius={8}
          >
            <LinearGradient
              colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.8)']}
              style={styles.audioOverlay}
            >
              <View style={styles.audioInfo}>
                <Image source={profileImageUri} style={styles.audioAvatar} />
                <Text style={styles.audioTitle}>{currentMedia.filename}</Text>
                <Text style={styles.audioSubtitle}>♪ قيد التشغيل ♪</Text>
              </View>
            </LinearGradient>
          </ImageBackground>
        )}

        {/* Tap overlay for controls */}
        <TouchableOpacity
          style={styles.tapOverlay}
          activeOpacity={1}
          onPress={handleScreenTap}
        />

        {/* Filter Menu */}
        <Animated.View
          style={[
            styles.filterMenu,
            {
              opacity: filterMenuOpacity,
              transform: [{ translateX: filterMenuTranslateX }],
            },
          ]}
          pointerEvents={showFilterMenu ? 'auto' : 'none'}
        >
          <LinearGradient
            colors={['rgba(45,55,72,0.95)', 'rgba(26,32,44,0.95)']}
            style={styles.filterMenuGradient}
          >
            <View style={styles.filterMenuHeader}>
              <Text style={styles.filterMenuTitle}>نوع الوسائط</Text>
              <TouchableOpacity
                style={styles.closeMenuButton}
                onPress={hideFilterMenuAnimated}
              >
                <X size={24} color="white" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.filterOption,
                mediaFilter === 'all' && styles.filterOptionActive,
              ]}
              onPress={() => handleFilterChange('all')}
            >
              <View style={styles.filterOptionContent}>
                <View style={styles.filterIconContainer}>
                  <Music size={24} color={mediaFilter === 'all' ? '#4299E1' : 'white'} />
                  <Film size={24} color={mediaFilter === 'all' ? '#4299E1' : 'white'} />
                </View>
                <Text style={[
                  styles.filterOptionText,
                  mediaFilter === 'all' && styles.filterOptionTextActive,
                ]}>
                  جميع الوسائط
                </Text>
                <Text style={styles.filterOptionCount}>
                  {allMediaItems.length}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterOption,
                mediaFilter === 'video' && styles.filterOptionActive,
              ]}
              onPress={() => handleFilterChange('video')}
            >
              <View style={styles.filterOptionContent}>
                <View style={styles.filterIconContainer}>
                  <Film size={28} color={mediaFilter === 'video' ? '#4299E1' : 'white'} />
                </View>
                <Text style={[
                  styles.filterOptionText,
                  mediaFilter === 'video' && styles.filterOptionTextActive,
                ]}>
                  الفيديوهات
                </Text>
                <Text style={styles.filterOptionCount}>
                  {allMediaItems.filter(item => item.mediaType === 'video').length}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterOption,
                mediaFilter === 'audio' && styles.filterOptionActive,
              ]}
              onPress={() => handleFilterChange('audio')}
            >
              <View style={styles.filterOptionContent}>
                <View style={styles.filterIconContainer}>
                  <Music size={28} color={mediaFilter === 'audio' ? '#4299E1' : 'white'} />
                </View>
                <Text style={[
                  styles.filterOptionText,
                  mediaFilter === 'audio' && styles.filterOptionTextActive,
                ]}>
                  الموسيقى
                </Text>
                <Text style={styles.filterOptionCount}>
                  {allMediaItems.filter(item => item.mediaType === 'audio').length}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.filterMenuFooter}>
              <Text style={styles.filterMenuHint}>
                اسحب لليسار لإظهار هذه القائمة
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Controls Overlay */}
        <Animated.View
          style={[
            styles.controlsOverlay,
            {
              opacity: controlsOpacity,
            },
          ]}
          pointerEvents={showControls ? 'auto' : 'none'}
        >
          {/* Top gradient */}
          <LinearGradient
            colors={['rgba(0,0,0,0.6)', 'transparent']}
            style={styles.topGradient}
          />

          {/* Current filter indicator */}
          <View style={styles.filterIndicator}>
            <Text style={styles.filterIndicatorText}>{getFilterTitle()}</Text>
            <Text style={styles.filterIndicatorCount}>
              {currentIndex + 1} / {filteredMediaItems.length}
            </Text>
          </View>

          {/* Bottom gradient */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.bottomGradient}
          />

          {/* Main play/pause button */}
          <TouchableOpacity
            style={styles.playButton}
            onPress={togglePlayPause}
          >
            {isPlaying ? (
              <Pause size={60} color="white" fill="white" />
            ) : (
              <Play size={60} color="white" fill="white" />
            )}
          </TouchableOpacity>

          {/* Right side actions */}
          <View style={styles.rightActions}>
            <View style={styles.profileSection}>
              <Image source={profileImageUri} style={styles.profileImage} />
            </View>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setIsLiked(!isLiked)}
            >
              <Heart
                size={32}
                color={isLiked ? "#FF6B6B" : "white"}
                fill={isLiked ? "#FF6B6B" : "transparent"}
              />
              <Text style={styles.actionText}>إعجاب</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton}>
              <Share size={32} color="white" />
              <Text style={styles.actionText}>مشاركة</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={toggleMute}
            >
              {isMuted ? (
                <VolumeX size={32} color="white" />
              ) : (
                <Volume2 size={32} color="white" />
              )}
              <Text style={styles.actionText}>
                {isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Bottom info */}
          <View style={styles.bottomInfo}>
            <Text style={styles.mediaTitle}>{currentMedia.filename}</Text>
            <Text style={styles.mediaSubtitle}>
              {formatTime(playbackPosition)} / {formatTime(playbackDuration)}
            </Text>
            
            {/* Progress bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${(playbackPosition / playbackDuration) * 100}%`,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
  },
  loadingText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
  },
  emptyText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  emptySubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
  },
  changeFilterButton: {
    backgroundColor: '#4299E1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
  },
  changeFilterText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  mediaContainer: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  videoContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  audioBackground: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  audioOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioInfo: {
    alignItems: 'center',
  },
  audioAvatar: {
    width: 220,
    height: 220,
    borderRadius: 110,
    marginBottom: 40,
    borderWidth: 6,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.44,
    shadowRadius: 10.32,
    elevation: 16,
  },
  audioTitle: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: -1, height: 1},
    textShadowRadius: 10,
  },
  audioSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 18,
    textAlign: 'center',
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: -1, height: 1},
    textShadowRadius: 10,
  },
  tapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  filterMenu: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 280,
    zIndex: 1000,
  },
  filterMenuGradient: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
  },
  filterMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  filterMenuTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeMenuButton: {
    padding: 8,
  },
  filterOption: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  filterOptionActive: {
    backgroundColor: 'rgba(66,153,225,0.2)',
  },
  filterOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterIconContainer: {
    flexDirection: 'row',
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterOptionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
    marginLeft: 15,
  },
  filterOptionTextActive: {
    color: '#4299E1',
    fontWeight: 'bold',
  },
  filterOptionCount: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 24,
    textAlign: 'center',
  },
  filterMenuFooter: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
  },
  filterMenuHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  filterIndicator: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterIndicatorText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  filterIndicatorCount: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  playButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  rightActions: {
    position: 'absolute',
    right: 20,
    bottom: 120,
    alignItems: 'center',
  },
  profileSection: {
    marginBottom: 20,
  },
  profileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: 'white',
  },
  actionButton: {
    alignItems: 'center',
    marginBottom: 20,
  },
  actionText: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  bottomInfo: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 100,
  },
  mediaTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  mediaSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: 10,
  },
  progressContainer: {
    width: '100%',
    marginTop: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4299E1',
    borderRadius: 2,
    shadowColor: '#4299E1',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
});