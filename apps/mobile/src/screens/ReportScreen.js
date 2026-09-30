import { useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSite } from '../site/SiteContext';
import { useAuth } from '../auth/AuthProvider';
import { sendReport } from '../lib/db';
import { todayKey } from '@siteflow/shared';
import { STAGES } from '@siteflow/shared';
import { Button, Choice, ErrorText, Field, H1, Muted, Notice, Row, Screen } from '../components/ui';
import { colors } from '../theme';

export default function ReportScreen() {
  const { user, profile } = useAuth();
  const { cid, sid, site, presentCount } = useSite();
  const [text, setText] = useState('');
  const [stage, setStage] = useState(null);
  const [progress, setProgress] = useState('');
  const [issues, setIssues] = useState('');
  const [photos, setPhotos] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (!site) return <Screen><Muted>Loading…</Muted></Screen>;
  if (site.lastReportDate === todayKey()) {
    return <Screen><H1>Daily report</H1><Notice>Today's report was sent at {site.lastReportTime}. The owner can see it now.</Notice></Screen>;
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setErr('Allow camera access in your phone settings to take site photos.');
    const r = await ImagePicker.launchCameraAsync({ quality: 0.5 });
    if (!r.canceled) setPhotos((p) => [...p, r.assets[0].uri].slice(0, 8));
  }
  async function pickPhotos() {
    const r = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, selectionLimit: 8, quality: 0.5 });
    if (!r.canceled) setPhotos((p) => [...p, ...r.assets.map((a) => a.uri)].slice(0, 8));
  }

  async function submit() {
    setErr('');
    if (!text.trim()) return setErr('Describe the work done today before sending.');
    if (presentCount === 0) return setErr('Mark attendance first so the report shows who was on site.');
    const p = progress === '' ? site.progress || 0 : Number(progress);
    if (!(p >= 0 && p <= 100)) return setErr('Progress must be between 0 and 100.');
    setBusy(true);
    try {
      await sendReport(cid, sid, {
        text: text.trim(), stage: stage || site.stage || STAGES[0], progress: p, issues: issues.trim(),
        photoUris: photos, workersPresent: presentCount, uid: user.uid, name: profile.name,
      });
      Alert.alert('Report saved', 'It goes to the owner right away, or as soon as you have signal.');
    } catch {
      setErr('Could not save the report. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Daily report</H1>
      <Muted style={{ marginBottom: 16 }}>{presentCount} workers marked present will be included.</Muted>
      <ErrorText>{err}</ErrorText>
      <Field label="Work done today" value={text} onChangeText={setText} multiline placeholder="e.g. Cast lintels over the living room windows" />
      <Choice label="Current stage" options={STAGES} value={stage || site.stage} onChange={setStage} />
      <Field label="Overall progress (%)" value={progress} onChangeText={setProgress} keyboardType="number-pad" placeholder={String(site.progress || 0)} />
      <Field label="Issues or delays" value={issues} onChangeText={setIssues} multiline placeholder="Leave empty if none" />
      <Text style={{ fontWeight: '600', color: colors.ink, marginBottom: 6 }}>Photos</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {photos.map((uri) => (
          <Pressable key={uri} onLongPress={() => setPhotos((p) => p.filter((x) => x !== uri))}>
            <Image source={{ uri }} style={{ width: 72, height: 56, borderRadius: 4 }} />
          </Pressable>
        ))}
      </View>
      <Row style={{ borderTopWidth: 0, paddingHorizontal: 0, paddingTop: 0 }}>
        <Button title="Take photo" variant="ghost" onPress={takePhoto} style={{ flex: 1 }} />
        <Button title="Choose photos" variant="ghost" onPress={pickPhotos} style={{ flex: 1 }} />
      </Row>
      <Muted style={{ marginBottom: 16, fontSize: 13 }}>Press and hold a photo to remove it. Photos upload when you have signal.</Muted>
      <Button title={busy ? 'Saving…' : 'Send report'} onPress={submit} disabled={busy} />
    </Screen>
  );
}
