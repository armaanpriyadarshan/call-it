# Copilot Instructions for call-it

## Project Overview
**call-it** is an Expo-based React Native mobile app supporting iOS, Android, and web platforms. It uses Expo Router for file-based routing with a tab-based navigation structure and demonstrates Expo's core ecosystem capabilities.

## Architecture & Key Patterns

### File-Based Routing
- Routes are defined in `app/` directory using Expo Router conventions
- `app/(tabs)/_layout.tsx` creates the bottom tab navigator with two screens: `index` (Home) and `explore` (Explore)
- `app/(tabs)/index.tsx` and `app/(tabs)/explore.tsx` are the main tab screens
- `app/modal.tsx` demonstrates modal presentation (not in tab bar)
- Lazy-loaded components with dynamic imports where needed

### Theming System
- **Colors defined in** `constants/theme.ts` with light/dark mode support
- **Hook-based access**: `useColorScheme()` returns current scheme, `useThemeColor()` resolves theme-specific colors
- **Themed components**: `ThemedText` and `ThemedView` wrap standard React Native components with automatic color resolution
- **Platform-specific handling**: Web requires hydration delay in `hooks/use-color-scheme.web.ts` for static rendering
- **Font system**: `Fonts` constant maps platform-specific font families (SF Symbols on iOS, system fonts elsewhere)

### Component Structure
- **Themed components** (`ThemedText`, `ThemedView`) are the base building blocks—use these for all UI
- **UI components** in `components/ui/` include cross-platform abstractions (e.g., `IconSymbol` maps SF Symbols to Material Icons)
- **Utility components** handle platform-specific logic:
  - `ExternalLink`: Opens URLs in in-app browser on native, default browser on web
  - `HapticTab`: Adds iOS haptic feedback to tab presses
  - `Collapsible`: Expandable sections with animated icons

### Animation & Performance
- `react-native-reanimated` powers all animations (parallax scroll, waving emoji, collapsible rotations)
- `ParallaxScrollView` is a reusable high-performance header component using `Animated.ScrollView`
- Animations use interpolation for smooth transitions tied to scroll offset

### Cross-Platform Patterns
- **Platform detection**: Use `Platform.select()` and `process.env.EXPO_OS` checks
- **Asset handling**: `expo-image` for optimized image loading
- **Icons**: SF Symbols on iOS fallback to Material Icons on Android/web (mappings in `MAPPING` object)
- **Haptics**: `expo-haptics` with `process.env.EXPO_OS === 'ios'` guards

## Development Workflow

### Starting the App
```bash
pnpm install
npx expo start
```
Press `i` for iOS Simulator, `a` for Android Emulator, or `w` for web.

### Key Commands
- `pnpm lint` — Run ESLint (uses `eslint-config-expo`)
- `npx expo start --ios/--android/--web` — Platform-specific launches
- `pnpm reset-project` — Reset to blank state (moves starter code to `app-example/`)

### Path Alias
- `@/*` maps to project root (configured in `tsconfig.json`)
- Always use `@/` imports for components, hooks, constants

### Environment
- **Node/pnpm** for package management
- **TypeScript** strict mode enabled
- **React 19.1.0** with React Native 0.81.5
- **Expo SDK 54.0.31** (check `app.json` for Android/iOS version policies)

## Code Style & Conventions

- **Destructuring**: Prefer destructuring in function parameters for readability
- **Theming**: Never hardcode colors—use `useThemeColor()` or themed components
- **Icons**: Add new SF Symbol → Material Icon mappings to `MAPPING` in `components/ui/icon-symbol.tsx`
- **Styling**: Use `StyleSheet.create()` and inline `style` props (no CSS-in-JS)
- **Exports**: Named exports for components; default exports for screens/pages

## Critical Integration Points

### Theme Dependency Chain
Component → `useThemeColor()` → `Colors` → `useColorScheme()` 
- Any color change flows through this chain; theming is injectable at multiple levels

### Navigation Stack
Root (`app/_layout.tsx`) → Tabs (`app/(tabs)/_layout.tsx`) → Screens (`index.tsx`, `explore.tsx`, `modal.tsx`)
- Modal uses `presentation: 'modal'` option in Stack.Screen config

### Expo Router Features Used
- `<Link>` component for navigation with `dismissTo` prop on modals
- Dynamic imports via `Link.Preview` for predictive UI
- `Link.Menu` for context menu actions

## When Adding Features

1. **New screens**: Create in `app/(tabs)/` and register in `_layout.tsx`
2. **New colors**: Add to `Colors` object in `constants/theme.ts` (both light/dark)
3. **New icons**: Add SF Symbol → Material Icon mapping, then use in `IconSymbol`
4. **Platform-specific logic**: Guard with `Platform.select()` or `process.env.EXPO_OS` checks
5. **Reusable logic**: Extract to hooks (place in `hooks/` with platform variants if needed)

## Testing & Debugging
- Use Expo dev tools via `cmd+d` (iOS), `cmd+m` (Android), or `F12` (web)
- Hot reload works by default; errors show in-app
- For web static output, check `app.json` `web.output: "static"` configuration
