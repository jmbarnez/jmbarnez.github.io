// Deprecated: audio constants moved to `src/utils/constants.js`.
// Keep thin compatibility wrappers to avoid refactoring call sites immediately.
import { getGlobalVolume as _getGlobalVolume, setGlobalVolume as _setGlobalVolume, onVolumeChange as _onVolumeChange } from './constants.js';

export function getGlobalVolume() { return _getGlobalVolume(); }
export function setGlobalVolume(v) { return _setGlobalVolume(v); }
export function onVolumeChange(cb) { return _onVolumeChange(cb); }