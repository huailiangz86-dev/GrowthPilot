// Safari can emit Enter with keyCode 229 when the IME is choosing a character.
export function shouldSendOnEnter(key: string, shift: boolean, composing: boolean, keyCode: number) {
  return key === 'Enter' && !shift && !composing && keyCode !== 229;
}
