import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, Card } from './ui';
import { colors } from '../theme';

const TIPS = [
  ['Three steps a day', 'Mark attendance, log the materials you used, then send the daily report with photos.'],
  ['Works without signal', 'Everything is saved on the phone first and sent when you are back online. The banner at the top shows what is waiting.'],
  ['Problems on site', 'Report an issue with a photo from the Issues tab. Your manager sees it straight away.'],
];

// Shown once on this phone for each person, the first time they open SiteFlow
export default function WelcomeIntro({ uid, name }) {
  const key = `siteflow.welcomeSeen.${uid}`;
  const [show, setShow] = useState(false);
  useEffect(() => { AsyncStorage.getItem(key).then((v) => setShow(!v)).catch(() => setShow(false)); }, [key]);
  if (!show) return null;
  const done = () => { setShow(false); AsyncStorage.setItem(key, '1').catch(() => {}); };
  return (
    <Card style={{ padding: 16, marginBottom: 14, backgroundColor: colors.navy, borderColor: colors.navy }}>
      <Text accessibilityRole="header" style={{ color: colors.onNavy, fontSize: 20, fontWeight: '800', marginBottom: 10 }}>Welcome{name ? `, ${name.split(' ')[0]}` : ''}</Text>
      {TIPS.map(([title, text], i) => (
        <View key={title} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brass, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.brassInk, fontWeight: '700' }}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.onNavy, fontWeight: '700' }}>{title}</Text>
            <Text style={{ color: colors.onNavyMuted, marginTop: 2 }}>{text}</Text>
          </View>
        </View>
      ))}
      <Button title="Got it" onPress={done} style={{ backgroundColor: colors.brass, marginTop: 4 }} />
    </Card>
  );
}
