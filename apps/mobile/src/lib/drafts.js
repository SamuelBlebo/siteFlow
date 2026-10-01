import AsyncStorage from '@react-native-async-storage/async-storage';

// Unsent form text, kept on the phone so closing the app or a crash doesn't lose it
const k = (key) => `siteflow:draft:${key}`;

export async function readDraft(key) {
  try { return JSON.parse(await AsyncStorage.getItem(k(key))) || null; } catch { return null; }
}
export function writeDraft(key, value) {
  return AsyncStorage.setItem(k(key), JSON.stringify(value)).catch((e) => console.warn('Draft not saved', e));
}
export function clearDraft(key) {
  return AsyncStorage.removeItem(k(key)).catch(() => {});
}
