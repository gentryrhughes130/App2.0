import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Alert, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { builtInSkins, ResonXSkin } from '@/constants/skins';

const tracks = [
  { title: 'Night Drive', artist: 'Chromatic Avenue', duration: '04:18', type: 'FLAC' },
  { title: 'Low Light', artist: 'Mira Sol', duration: '03:42', type: 'WAV' },
  { title: 'Transit Lines', artist: 'Northstar', duration: '05:06', type: 'MP3' },
];
type Track = (typeof tracks)[number] & { uri?: string };
const bands = [36, 54, 42, 68, 82, 61, 74, 49, 64, 44, 58, 38, 51, 32, 45, 28];
const queueStore = `${Paths.document.uri}resonx-library.json`;
const audioExtensions = new Set(['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus']);

export default function HomeScreen() {
  const [library, setLibrary] = useState<Track[]>(tracks);
  const [isPlaying, setIsPlaying] = useState(true);
  const [activeTrack, setActiveTrack] = useState(0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [category, setCategory] = useState('FOLDERS');
  const [bass, setBass] = useState(2.5);
  const [treble, setTreble] = useState(1);
  const [volume, setVolume] = useState(78);
  const [selectedFolder, setSelectedFolder] = useState('No folder selected');
  const [skin, setSkin] = useState<ResonXSkin>(builtInSkins[0]);
  const currentTrack = library[activeTrack];
  const player = useAudioPlayer(currentTrack?.uri ? { uri: currentTrack.uri } : null);
  const playerStatus = useAudioPlayerStatus(player);
  const artGestures = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 12 || gesture.dy > 12,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 70) setIsMinimized(true);
      else if (gesture.dx > 70) setActiveTrack((activeTrack + library.length - 1) % library.length);
      else if (gesture.dx < -70) setActiveTrack((activeTrack + 1) % library.length);
    },
  });

  useEffect(() => {
    void restoreLibrary();
  }, []);

  useEffect(() => {
    if (library.some((track) => track.uri)) {
      void FileSystem.writeAsStringAsync(queueStore, JSON.stringify({ library, activeTrack, selectedFolder, bass, treble, volume, skin }));
    }
  }, [library, activeTrack, selectedFolder, bass, treble, volume]);

  async function restoreLibrary() {
    try {
      const saved = JSON.parse(await FileSystem.readAsStringAsync(queueStore)) as {
        library?: Track[]; activeTrack?: number; selectedFolder?: string; bass?: number; treble?: number; volume?: number; skin?: ResonXSkin;
      };
      if (saved.library?.length) setLibrary(saved.library);
      if (typeof saved.activeTrack === 'number') setActiveTrack(Math.min(saved.activeTrack, (saved.library?.length ?? 1) - 1));
      if (saved.selectedFolder) setSelectedFolder(saved.selectedFolder);
      if (typeof saved.bass === 'number') setBass(saved.bass);
      if (typeof saved.treble === 'number') setTreble(saved.treble);
      if (typeof saved.volume === 'number') setVolume(saved.volume);
      if (saved.skin?.id) setSkin(saved.skin);
    } catch {
      // The first launch has no store yet.
    }
  }

  function chooseSkin() {
    Alert.alert('ResonX skins', 'Choose a visual theme', builtInSkins.map((option) => ({
      text: option.name,
      onPress: () => setSkin(option),
    })));
  }

  function adjustControl(control: 'bass' | 'treble' | 'volume') {
    if (control === 'bass') setBass((value) => (value >= 6 ? -6 : value + 0.5));
    if (control === 'treble') setTreble((value) => (value >= 6 ? -6 : value + 0.5));
    if (control === 'volume') setVolume((value) => (value >= 100 ? 0 : value + 5));
  }

  useEffect(() => {
    if (currentTrack?.uri) {
      player.play();
      setIsPlaying(true);
    }
  }, [activeTrack, currentTrack?.uri, player]);

  useEffect(() => {
    player.volume = volume / 100;
  }, [player, volume]);

  async function addLocalFiles() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    const importedTracks: Track[] = result.assets.map((asset) => ({
      title: asset.name.replace(/\.[^/.]+$/, ''),
      artist: 'LOCAL FILE',
      duration: '00:00',
      type: asset.name.split('.').pop()?.toUpperCase() ?? 'AUDIO',
      uri: asset.uri,
    }));
    setLibrary((currentLibrary) => {
      setActiveTrack(currentLibrary.length);
      return [...currentLibrary, ...importedTracks];
    });
    setIsPlaying(false);
  }

  async function selectFolder() {
    if (Platform.OS === 'web') {
      await addLocalFiles();
      return;
    }
    const directory = await Directory.pickDirectoryAsync();
    setSelectedFolder(directory.uri.split('/').pop() || 'Selected folder');
    const files = enumerateAudioFiles(directory);
    if (files.length) {
      const importedTracks = files.map((file) => ({
        title: file.name.replace(/\.[^/.]+$/, ''), artist: 'LOCAL FOLDER', duration: '00:00',
        type: file.name.split('.').pop()?.toUpperCase() ?? 'AUDIO', uri: file.uri,
      }));
      setLibrary((currentLibrary) => {
        setActiveTrack(currentLibrary.length);
        return [...currentLibrary, ...importedTracks];
      });
      setIsPlaying(false);
    }
  }

  function enumerateAudioFiles(directory: Directory): File[] {
    return directory.list().flatMap((entry) => {
      if (entry instanceof Directory) return enumerateAudioFiles(entry);
      if (entry instanceof File && audioExtensions.has(entry.name.split('.').pop()?.toLowerCase() ?? '')) return [entry];
      return [];
    });
  }

  function togglePlayback() {
    if (!currentTrack?.uri) {
      setIsPlaying((playing) => !playing);
      return;
    }
    if (playerStatus.playing) player.pause();
    else player.play();
    setIsPlaying(!playerStatus.playing);
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View><ThemedText style={[styles.kicker, { color: skin.accent }]}>AUDIO / LOCAL LIBRARY</ThemedText><ThemedText style={[styles.logo, { color: skin.text }]}>ResonX</ThemedText></View>
            <Pressable onPress={chooseSkin} style={styles.iconButton} accessibilityLabel="Choose ResonX skin"><SymbolView name="paintbrush.pointed" tintColor={skin.accent} size={20} /></Pressable>
          </View>

          <View style={[styles.hero, isMinimized && styles.minimized]}>
            <Pressable {...artGestures.panHandlers} style={styles.albumArt} accessibilityLabel="Album art. Swipe to change tracks or minimize"><View style={styles.artCircle} /><View style={styles.artLine} /><ThemedText style={styles.artLabel}>ND / 01</ThemedText></Pressable>
            <View style={styles.trackInfo}><ThemedText style={styles.nowPlaying}>NOW PLAYING</ThemedText><ThemedText style={styles.trackTitle}>{currentTrack.title}</ThemedText><ThemedText style={styles.artist}>{currentTrack.artist}</ThemedText><View style={styles.tags}><View style={styles.tag}><ThemedText style={styles.tagText}>{currentTrack.type}</ThemedText></View><View style={styles.tag}><ThemedText style={styles.tagText}>24 BIT / 96 KHZ</ThemedText></View></View></View>
          </View>

          <Pressable style={[styles.progressArea, isMinimized && styles.minimized]} onPress={() => playerStatus.duration > 0 && player.seekTo(playerStatus.duration * 0.41)} accessibilityLabel="Seek through waveform"><View style={styles.waveform}>{bands.map((height, index) => <View key={index} style={[styles.waveformBar, { height: height / 2 }]} />)}</View><View style={styles.progressTrack}><View style={styles.progressFill} /><View style={styles.progressKnob} /></View><View style={styles.timeRow}><ThemedText style={styles.time}>{playerStatus.currentTime ? `${Math.floor(playerStatus.currentTime / 60).toString().padStart(2, '0')}:${Math.floor(playerStatus.currentTime % 60).toString().padStart(2, '0')}` : '01:47'}</ThemedText><ThemedText style={styles.time}>{playerStatus.duration ? `${Math.floor(playerStatus.duration / 60).toString().padStart(2, '0')}:${Math.floor(playerStatus.duration % 60).toString().padStart(2, '0')}` : '04:18'}</ThemedText></View></Pressable>
          <View style={[styles.controls, isMinimized && styles.minimized]}>
            <Pressable onPress={() => setIsShuffle(!isShuffle)} style={styles.smallControl} accessibilityLabel="Toggle shuffle"><SymbolView name="shuffle" tintColor={isShuffle ? '#F0A35B' : '#8E918E'} size={19} /></Pressable>
            <Pressable style={styles.smallControl} accessibilityLabel="Previous track"><SymbolView name="backward.end.fill" tintColor="#F7F3EA" size={20} /></Pressable>
            <Pressable onPress={togglePlayback} style={styles.playButton} accessibilityLabel={isPlaying ? 'Pause' : 'Play'}><SymbolView name={isPlaying ? 'pause.fill' : 'play.fill'} tintColor="#131514" size={23} /></Pressable>
            <Pressable onPress={() => setActiveTrack((activeTrack + 1) % library.length)} style={styles.smallControl} accessibilityLabel="Next track"><SymbolView name="forward.end.fill" tintColor="#F7F3EA" size={20} /></Pressable>
            <Pressable onPress={() => setIsRepeat(!isRepeat)} style={styles.smallControl} accessibilityLabel="Toggle repeat"><SymbolView name="repeat" tintColor={isRepeat ? '#F0A35B' : '#8E918E'} size={19} /></Pressable>
          </View>

          <View style={styles.sectionHeader}><ThemedText style={styles.sectionTitle}>SIGNAL CHAIN</ThemedText><ThemedText style={styles.sectionMeta}>DSP ACTIVE</ThemedText></View>
          <View style={styles.equalizer}><View style={styles.eqTop}><ThemedText style={styles.eqName}>GRAPHIC EQ</ThemedText><ThemedText style={styles.eqMode}>16 BANDS</ThemedText></View><View style={styles.bars}>{bands.map((height, index) => <View key={index} style={styles.barTrack}><View style={[styles.bar, { height }]} /></View>)}</View><View style={styles.frequencyRow}><ThemedText style={styles.frequency}>32</ThemedText><ThemedText style={styles.frequency}>250</ThemedText><ThemedText style={styles.frequency}>1K</ThemedText><ThemedText style={styles.frequency}>4K</ThemedText><ThemedText style={styles.frequency}>16K</ThemedText></View></View>

          <View style={styles.knobRow}>{[['BASS', bass, 'bass'], ['TREBLE', treble, 'treble'], ['VOLUME', volume, 'volume']].map(([label, value, control]) => <Pressable key={label} onPress={() => adjustControl(control as 'bass' | 'treble' | 'volume')} style={styles.knobControl}><View style={styles.knob}><View style={styles.knobMarker} /></View><ThemedText style={styles.knobLabel}>{label}</ThemedText><ThemedText style={styles.knobValue}>{control === 'volume' ? `${value}%` : `${value} dB`}</ThemedText></Pressable>)}</View>
          <View style={styles.featureRow}><View style={styles.feature}><ThemedText style={styles.featureLabel}>BASS</ThemedText><ThemedText style={styles.featureValue}>{bass > 0 ? '+' : ''}{bass} dB</ThemedText></View><View style={styles.feature}><ThemedText style={styles.featureLabel}>TREBLE</ThemedText><ThemedText style={styles.featureValue}>{treble > 0 ? '+' : ''}{treble} dB</ThemedText></View><View style={styles.feature}><ThemedText style={styles.featureLabel}>OUTPUT</ThemedText><ThemedText style={styles.featureValue}>USB DAC</ThemedText></View></View>
          <View style={styles.categoryRow}>{['FOLDERS', 'ARTISTS', 'ALBUMS', 'GENRES'].map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.category, category === item && styles.categoryActive]}><ThemedText style={[styles.categoryText, category === item && styles.categoryTextActive]}>{item}</ThemedText></Pressable>)}<Pressable onPress={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')} style={styles.viewToggle}><SymbolView name={viewMode === 'list' ? 'square.grid.2x2' : 'list.bullet'} tintColor="#F0A35B" size={18} /></Pressable></View>
          <View style={styles.sectionHeader}><ThemedText style={styles.sectionTitle}>{category}</ThemedText><Pressable><ThemedText style={styles.browse}>BROWSE ALL</ThemedText></Pressable></View>
          <View style={viewMode === 'grid' ? styles.grid : undefined}>{library.map((track, index) => <Pressable key={`${track.title}-${index}`} onLongPress={() => Alert.alert(track.title, 'Choose an action', [{ text: 'Queue next' }, { text: 'Edit tags' }, { text: 'Sleep timer' }, { text: 'Cancel', style: 'cancel' }])} onPress={() => { setActiveTrack(index); setIsPlaying(true); setIsMinimized(false); }} style={[styles.trackRow, activeTrack === index && styles.activeTrack, viewMode === 'grid' && styles.gridTrack]}><View style={[styles.trackNumber, activeTrack === index && styles.activeNumber]}><ThemedText style={styles.numberText}>{activeTrack === index && isPlaying ? '||' : String(index + 1).padStart(2, '0')}</ThemedText></View><View style={styles.trackCopy}><ThemedText style={styles.rowTitle}>{track.title}</ThemedText><ThemedText style={styles.rowArtist}>{track.artist}  /  {track.type}</ThemedText></View><ThemedText style={styles.duration}>{track.duration}</ThemedText></Pressable>)}</View>
          <ThemedText style={styles.folderStatus}>{selectedFolder}</ThemedText><View style={styles.importRow}><Pressable onPress={addLocalFiles} style={[styles.folderButton, styles.importButton]} accessibilityLabel="Select songs"><SymbolView name="music.note.list" tintColor="#131514" size={19} /><ThemedText style={styles.folderButtonText}>SELECT SONGS</ThemedText></Pressable><Pressable onPress={selectFolder} style={[styles.folderButton, styles.importButton]} accessibilityLabel="Select a music folder"><SymbolView name="folder.badge.plus" tintColor="#131514" size={19} /><ThemedText style={styles.folderButtonText}>SELECT FOLDER</ThemedText></Pressable></View>
        </ScrollView>
        <View style={styles.bottomDock}><View style={styles.dockArt}><ThemedText style={styles.dockArtText}>ND</ThemedText></View><View style={styles.dockCopy}><ThemedText style={styles.dockTitle}>{currentTrack.title}</ThemedText><ThemedText style={styles.dockArtist}>{currentTrack.artist}</ThemedText></View><Pressable onPress={togglePlayback} accessibilityLabel={isPlaying ? 'Pause' : 'Play'}><SymbolView name={isPlaying ? 'pause.fill' : 'play.fill'} tintColor="#F0A35B" size={21} /></Pressable></View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#131514' }, safeArea: { flex: 1, paddingHorizontal: 20, paddingBottom: BottomTabInset, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' }, content: { paddingTop: 18, paddingBottom: 115 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 34 }, kicker: { color: '#8E918E', fontSize: 10, letterSpacing: 1.8, fontWeight: '700' }, logo: { color: '#F7F3EA', fontSize: 32, fontWeight: '800', marginTop: 4 }, iconButton: { width: 42, height: 42, borderWidth: 1, borderColor: '#343936', alignItems: 'center', justifyContent: 'center', borderRadius: 21 }, hero: { flexDirection: 'row', gap: 20, alignItems: 'center' }, albumArt: { width: 138, height: 138, backgroundColor: '#D87139', overflow: 'hidden', justifyContent: 'flex-end', padding: 13 }, artCircle: { position: 'absolute', width: 128, height: 128, borderRadius: 64, borderWidth: 28, borderColor: '#F0A35B', top: 18, left: 26 }, artLine: { position: 'absolute', width: 180, height: 2, backgroundColor: '#131514', transform: [{ rotate: '-42deg' }], top: 64, left: -20 }, artLabel: { color: '#131514', fontSize: 11, fontWeight: '800', letterSpacing: 1 }, trackInfo: { flex: 1 }, nowPlaying: { color: '#F0A35B', fontSize: 10, letterSpacing: 1.5, fontWeight: '800', marginBottom: 8 }, trackTitle: { color: '#F7F3EA', fontSize: 27, lineHeight: 31, fontWeight: '800' }, artist: { color: '#B8BCB7', fontSize: 14, marginTop: 5 }, tags: { flexDirection: 'row', gap: 6, marginTop: 16, flexWrap: 'wrap' }, tag: { borderWidth: 1, borderColor: '#555A55', paddingHorizontal: 7, paddingVertical: 4 }, tagText: { color: '#B8BCB7', fontSize: 8, letterSpacing: 1, fontWeight: '700' },
  progressArea: { marginTop: 29 }, waveform: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }, waveformBar: { width: 4, backgroundColor: '#D87139', borderRadius: 2 }, progressTrack: { height: 3, backgroundColor: '#3C413D', position: 'relative' }, progressFill: { width: '41%', height: 3, backgroundColor: '#F0A35B' }, progressKnob: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#F0A35B', position: 'absolute', left: '40%', top: -3 }, timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }, time: { color: '#8E918E', fontSize: 10 }, minimized: { display: 'none' }, controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 19, marginBottom: 37 }, smallControl: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center' }, playButton: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#F0A35B', alignItems: 'center', justifyContent: 'center' }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, sectionTitle: { color: '#F7F3EA', fontSize: 11, letterSpacing: 1.5, fontWeight: '800' }, sectionMeta: { color: '#F0A35B', fontSize: 9, letterSpacing: 1.2, fontWeight: '800' }, equalizer: { backgroundColor: '#1B1E1C', padding: 16, borderWidth: 1, borderColor: '#2D322E' }, eqTop: { flexDirection: 'row', justifyContent: 'space-between' }, eqName: { color: '#B8BCB7', fontSize: 10, letterSpacing: 1, fontWeight: '700' }, eqMode: { color: '#8E918E', fontSize: 9, letterSpacing: 1 }, bars: { height: 95, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 }, barTrack: { height: 95, width: 7, justifyContent: 'flex-end', backgroundColor: '#2D322E' }, bar: { width: 7, backgroundColor: '#D87139' }, frequencyRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 }, frequency: { color: '#6F756F', fontSize: 9 },
  knobRow: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 25 }, knobControl: { alignItems: 'center' }, knob: { width: 54, height: 54, borderRadius: 27, borderWidth: 7, borderColor: '#3C413D', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 3 }, knobMarker: { width: 3, height: 10, backgroundColor: '#F0A35B' }, knobLabel: { color: '#8E918E', fontSize: 9, letterSpacing: 1, marginTop: 8 }, knobValue: { color: '#F7F3EA', fontSize: 11, marginTop: 3, fontWeight: '700' }, categoryRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#2D322E', marginBottom: 20 }, category: { paddingVertical: 10, marginRight: 15 }, categoryActive: { borderBottomWidth: 2, borderBottomColor: '#F0A35B' }, categoryText: { color: '#6F756F', fontSize: 9, letterSpacing: 1, fontWeight: '800' }, categoryTextActive: { color: '#F0A35B' }, viewToggle: { marginLeft: 'auto', padding: 10 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, gridTrack: { width: '48%', flexDirection: 'column', alignItems: 'flex-start', padding: 12, minHeight: 120 }, featureRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#2D322E', marginBottom: 36 }, feature: { flex: 1, paddingVertical: 16, borderRightWidth: 1, borderRightColor: '#2D322E', paddingLeft: 10 }, featureLabel: { color: '#6F756F', fontSize: 9, letterSpacing: 1, fontWeight: '700' }, featureValue: { color: '#F7F3EA', fontSize: 12, marginTop: 6, fontWeight: '700' }, browse: { color: '#F0A35B', fontSize: 9, letterSpacing: 1, fontWeight: '800' }, trackRow: { flexDirection: 'row', alignItems: 'center', minHeight: 67, borderBottomWidth: 1, borderBottomColor: '#2D322E', paddingVertical: 10 }, activeTrack: { backgroundColor: '#1B1E1C' }, trackNumber: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#343936', marginRight: 13 }, activeNumber: { borderColor: '#D87139' }, numberText: { color: '#F0A35B', fontSize: 11, fontWeight: '800' }, trackCopy: { flex: 1 }, rowTitle: { color: '#F7F3EA', fontSize: 14, fontWeight: '700' }, rowArtist: { color: '#7E847F', fontSize: 11, marginTop: 4 }, duration: { color: '#8E918E', fontSize: 11 }, folderButton: { height: 48, backgroundColor: '#F0A35B', flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', marginTop: 18 }, folderButtonText: { color: '#131514', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 }, bottomDock: { position: 'absolute', bottom: 0, left: 20, right: 20, height: 72, borderTopWidth: 1, borderTopColor: '#343936', backgroundColor: '#131514', flexDirection: 'row', alignItems: 'center', gap: 12 }, dockArt: { width: 42, height: 42, backgroundColor: '#D87139', alignItems: 'center', justifyContent: 'center' }, dockArtText: { color: '#131514', fontWeight: '900', fontSize: 11 }, dockCopy: { flex: 1 }, dockTitle: { color: '#F7F3EA', fontSize: 13, fontWeight: '700' }, dockArtist: { color: '#7E847F', fontSize: 11, marginTop: 3 },
  folderStatus: { color: '#6F756F', fontSize: 10, marginBottom: 10 }, importRow: { flexDirection: 'row', gap: 10, marginBottom: 24 }, importButton: { flex: 1 },
});
