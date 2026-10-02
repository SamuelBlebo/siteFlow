import { Component } from 'react';
import { Text, View } from 'react-native';
import { Button } from './ui';
import { colors } from '../theme';

// Catches a crash in a screen so the person sees what to do instead of a blank or closed app.
// Reports, attendance and materials already saved on the phone are kept (outbox and journal).
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Screen crashed', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.bg }} accessibilityRole="alert">
        <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: '700', color: colors.ink, marginBottom: 8 }}>Something went wrong</Text>
        <Text style={{ color: colors.muted, marginBottom: 20 }}>
          This screen hit a problem. Everything you saved on this phone is kept and will still be sent. Tap Try again; if it keeps happening, close and reopen SiteFlow.
        </Text>
        <Button title="Try again" onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}
