import { useState } from 'react';
import { Alert, Image, Linking, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Button, ErrorText, s } from './ui';
import { colors } from '../theme';

// Photos for a report or an issue: take with the camera or pick from the gallery, see them,
// remove one (with a check first, so a slip of the thumb loses nothing). Used by every form
// with photos, so they all behave the same.
export default function PhotoPicker({ photos, onChange, limit }) {
  const [err, setErr] = useState('');
  const room = limit - photos.length;

  async function add(fromCamera) {
    setErr('');
    if (room <= 0) return setErr(`You can add up to ${limit} photos.`);
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          // Once refused for good, only the phone's settings can allow it again
          if (!perm.canAskAgain) {
            return Alert.alert('Camera is blocked', 'Allow SiteFlow to use the camera in your phone settings to take site photos.', [
              { text: 'Not now', style: 'cancel' }, { text: 'Open settings', onPress: () => Linking.openSettings() },
            ]);
          }
          return setErr('SiteFlow needs the camera to take photos. You can still pick photos from the gallery.');
        }
      }
      const r = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: room, quality: 0.8 });
      if (!r.canceled) onChange([...photos, ...r.assets.map((a) => a.uri)].slice(0, limit));
    } catch (e) {
      console.warn('Photo not added', e);
      setErr('Could not open the camera or gallery. Try again.');
    }
  }

  const remove = (uri, i) => Alert.alert(`Remove photo ${i + 1}?`, 'It will not be sent.', [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => onChange(photos.filter((x) => x !== uri)) },
  ]);

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>Photos ({photos.length}/{limit})</Text>
      <ErrorText>{err}</ErrorText>
      {photos.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10, paddingTop: 8 }}>
          {photos.map((uri, i) => (
            <View key={uri}>
              <Image source={{ uri }} style={{ width: 84, height: 64, borderRadius: 6, backgroundColor: colors.sunk }} accessibilityLabel={`Photo ${i + 1}`} />
              <Pressable onPress={() => remove(uri, i)} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} hitSlop={10}
                style={{ position: 'absolute', top: -8, right: -8, backgroundColor: colors.bad, borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {room > 0 ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Take photo" variant="ghost" onPress={() => add(true)} style={{ flex: 1 }} />
          <Button title="From gallery" variant="ghost" onPress={() => add(false)} style={{ flex: 1 }} />
        </View>
      ) : null}
    </View>
  );
}
