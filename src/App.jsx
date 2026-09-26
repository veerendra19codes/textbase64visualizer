import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronRight, Copy, RotateCcw, X } from 'lucide-react'
import './App.css'

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const PREVIEW_BLOCKS = 2
const PREVIEW_CHARACTERS = 8
const RECENT_INPUTS_KEY = 'base64visualizer:recent-inputs'
const MAX_RECENT_INPUTS = 4
const EXAMPLES = ['messi', 'ronaldo', 'neymar']

function toBinary(byte) {
  return byte.toString(2).padStart(8, '0')
}

function encodeText(value) {
  const bytes = Array.from(new TextEncoder().encode(value))
  const characterDetails = Array.from(value, (character, index) => {
    const codePoint = character.codePointAt(0)
    const characterBytes = Array.from(new TextEncoder().encode(character))

    return {
      character,
      index: index + 1,
      codePoint,
      codePointHex: codePoint.toString(16).toUpperCase().padStart(4, '0'),
      bytes: characterBytes,
    }
  })
  const blocks = []

  for (let offset = 0; offset < bytes.length; offset += 3) {
    const blockBytes = bytes.slice(offset, offset + 3)
    const [first = 0, second = 0, third = 0] = blockBytes
    const values = [
      first >> 2,
      ((first & 0b11) << 4) | (second >> 4),
      ((second & 0b1111) << 2) | (third >> 6),
      third & 0b111111,
    ]
    const padding = 3 - blockBytes.length
    const output = values
      .map((index, position) =>
        position < 4 - padding ? BASE64_ALPHABET[index] : '=',
      )
      .join('')

    blocks.push({
      bytes: blockBytes,
      firstByte: offset + 1,
      binary: blockBytes.map(toBinary).join('').padEnd(24, '0'),
      sextets: values.map((index, position) => ({
        bits: values[position].toString(2).padStart(6, '0'),
        value: index,
        character: position < 4 - padding ? BASE64_ALPHABET[index] : null,
      })),
      output,
      padding,
    })
  }

  return {
    bytes,
    blocks,
    encoded: blocks.map((block) => block.output).join(''),
    characters: characterDetails.length,
    characterDetails,
  }
}

function readRecentInputs() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(RECENT_INPUTS_KEY) ?? '[]')
    return Array.isArray(stored)
      ? stored.filter((value) => typeof value === 'string' && value.length > 0).slice(0, MAX_RECENT_INPUTS)
      : []
  } catch {
    return []
  }
}

function characterLabel(character) {
  if (character === ' ') return 'SPACE'
  if (character === '\n') return 'LF'
  if (character === '\r') return 'CR'
  if (character === '\t') return 'TAB'
  return character
}

function CharacterTable({ characters }) {
  if (!characters.length) {
    return <p className="empty-step">Enter text to see how each character becomes UTF-8 bytes.</p>
  }

  return (
    <div className="character-table-scroll">
      <table className="character-table">
        <thead>
          <tr>
            <th scope="col">CHARACTER</th>
            <th scope="col">UNICODE</th>
            <th scope="col">DECIMAL</th>
            <th scope="col">HEX CODE POINT</th>
            <th scope="col">UTF-8 BYTE(S)</th>
          </tr>
        </thead>
        <tbody>
          {characters.map((item) => (
            <tr key={item.index}>
              <th scope="row">
                <span className="character-glyph">{characterLabel(item.character)}</span>
                <span className="character-position">{String(item.index).padStart(2, '0')}</span>
              </th>
              <td><code>U+{item.codePointHex}</code></td>
              <td>{item.codePoint}</td>
              <td>{item.codePointHex}</td>
              <td>
                <span className="character-bytes">
                  {item.bytes.map((byte, index) => (
                    <span className="character-byte" key={`${item.index}-${index}`}>
                      <code>{byte.toString(16).padStart(2, '0').toUpperCase()}</code>
                      <span>{toBinary(byte)}</span>
                    </span>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ByteGroup({ block, number }) {
  return (
    <article className="byte-group">
      <div className="group-heading">
        <span className="group-index">BLOCK {String(number).padStart(2, '0')}</span>
        <span className="group-range">
          Bytes {block.firstByte}–{block.firstByte + block.bytes.length - 1}
        </span>
      </div>

      <div className="block-bytes" aria-label="Bytes in this block">
        {block.bytes.map((byte, index) => (
          <span className="block-byte" key={`${block.firstByte}-${index}`}>
            <span>{byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '·'}</span>
            <code>{byte.toString(16).padStart(2, '0').toUpperCase()}</code>
          </span>
        ))}
        {Array.from({ length: block.padding }, (_, index) => (
          <span className="block-byte virtual-byte" key={`pad-${index}`}>
            <span>0</span>
            <code>00</code>
          </span>
        ))}
      </div>

      <div className="bit-line" aria-label="Padded 24-bit block">
        {block.binary.match(/.{1,6}/g)?.map((bits, index) => (
          <span className="bit-cell" key={`${block.firstByte}-${index}`}>
            {bits}
          </span>
        ))}
      </div>

      <div className="sextet-grid" aria-label="Six-bit values and Base64 characters">
        {block.sextets.map((sextet, index) => (
          <div className={`sextet ${sextet.character === null ? 'sextet-pad' : ''}`} key={`${block.firstByte}-s${index}`}>
            <span className="sextet-bits">{sextet.bits}</span>
            <span className="sextet-result">
              {sextet.character === null ? (
                <><span className="sextet-value">{sextet.value}</span><span className="padding-mark">=</span></>
              ) : (
                <><span className="sextet-value">{sextet.value}</span><span className="mapped-char">{sextet.character}</span></>
              )}
            </span>
          </div>
        ))}
      </div>
    </article>
  )
}

function App() {
  const [input, setInput] = useState('messi')
  const [copyState, setCopyState] = useState('idle')
  const [recentInputs, setRecentInputs] = useState(readRecentInputs)
  const dialogRef = useRef(null)
  const recentTimerRef = useRef(null)
  const result = encodeText(input)
  const previewBlocks = result.blocks.slice(0, PREVIEW_BLOCKS)
  const previewCharacters = result.characterDetails.slice(0, PREVIEW_CHARACTERS)
  const firstBlock = result.blocks[0]
  const firstBlockBytes = Array.from({ length: 3 }, (_, index) => ({
    value: firstBlock?.bytes[index] ?? 0,
    virtual: index >= (firstBlock?.bytes.length ?? 0),
  }))
  const padding = result.blocks.at(-1)?.padding ?? 0
  const remainder = result.bytes.length % 3
  const recentOptions = recentInputs.filter((value) => value !== input && !EXAMPLES.includes(value))

  useEffect(() => () => window.clearTimeout(recentTimerRef.current), [])

  function queueRecentInput(value) {
    window.clearTimeout(recentTimerRef.current)
    if (!value) return

    recentTimerRef.current = window.setTimeout(() => {
      setRecentInputs((current) => {
        const updated = [value, ...current.filter((previous) => previous !== value)]
          .slice(0, MAX_RECENT_INPUTS)
        try {
          window.sessionStorage.setItem(RECENT_INPUTS_KEY, JSON.stringify(updated))
        } catch {
          return updated
        }
        return updated
      })
    }, 700)
  }

  function chooseInput(value) {
    setInput(value)
    setCopyState('idle')
    queueRecentInput(value)
  }

  async function copyResult() {
    if (!result.encoded) return

    try {
      await navigator.clipboard.writeText(result.encoded)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('failed')
      window.setTimeout(() => setCopyState('idle'), 2200)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Bit by Bit home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
          <span className="brand-name">BIT BY BIT</span>
        </a>
        <span className="topbar-note"><span className="live-dot" /> ENCODING LAB <span className="topbar-divider">/</span> UTF-8 → BASE64</span>
      </header>

      <main id="top">
        <section className="intro">
          <p className="eyebrow"><span>01</span> A VISUAL ENCODER</p>
          <h1>Text goes in.<br /><em>Bits come out.</em></h1>
          <p className="intro-copy">Follow each byte as it becomes a Base64 character. Nothing hidden, nothing encrypted.</p>
        </section>

        <section className="workbench" aria-label="Base64 encoder">
          <div className="input-panel">
            <div className="panel-topline">
              <label htmlFor="source-text">YOUR STRING</label>
              <span className="input-count">{result.characters} {result.characters === 1 ? 'character' : 'characters'}</span>
            </div>
            <textarea
              id="source-text"
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                setCopyState('idle')
                queueRecentInput(event.target.value)
              }}
              placeholder="Type or paste a string..."
              rows={3}
              spellCheck="false"
            />
            <div className="input-footer">
              <div className="examples" aria-label="Example strings">
                <span>TRY</span>
                {EXAMPLES.map((sample) => (
                  <button type="button" key={sample} onClick={() => chooseInput(sample)}>{sample}</button>
                ))}
              </div>
              <button
                className="icon-button clear-button"
                type="button"
                aria-label="Clear input"
                title="Clear input"
                onClick={() => { setInput(''); setCopyState('idle') }}
                disabled={!input}
              ><RotateCcw size={15} strokeWidth={1.8} /></button>
            </div>
            {recentOptions.length > 0 && (
              <div className="recent-row" aria-label="Recent strings this session">
                <span>RECENT <span className="recent-session">THIS SESSION</span></span>
                <div className="recent-list">
                  {recentOptions.map((value) => (
                    <button
                      type="button"
                      key={value}
                      title={value}
                      onClick={() => chooseInput(value)}
                    >{Array.from(value).slice(0, 14).join('')}{Array.from(value).length > 14 ? '…' : ''}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="output-panel">
            <div className="output-label"><span>BASE64 OUTPUT</span><span className="output-dot" /></div>
            <output className="encoded-value" aria-live="polite" aria-label="Base64 output">
              {result.encoded || <span className="empty-output">Your encoded string appears here</span>}
            </output>
            <div className="output-footer">
              <span>{result.bytes.length} UTF-8 {result.bytes.length === 1 ? 'byte' : 'bytes'} <span className="footer-divider">·</span> {result.encoded.length} Base64 {result.encoded.length === 1 ? 'character' : 'characters'}</span>
              <button className="copy-button" type="button" onClick={copyResult} disabled={!result.encoded}>
                {copyState === 'copied' ? <Check size={15} /> : <Copy size={15} />}
                {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
              </button>
            </div>
          </div>
        </section>

        <section className="stats-strip" aria-label="Input summary">
          <div className="stat"><span className="stat-number">{result.characters.toString().padStart(2, '0')}</span><span>characters</span></div>
          <ChevronRight className="stat-arrow" size={16} aria-hidden="true" />
          <div className="stat"><span className="stat-number">{result.bytes.length.toString().padStart(2, '0')}</span><span>UTF-8 bytes</span></div>
          <ChevronRight className="stat-arrow" size={16} aria-hidden="true" />
          <div className="stat"><span className="stat-number">{result.blocks.length.toString().padStart(2, '0')}</span><span>3-byte blocks</span></div>
          <ChevronRight className="stat-arrow" size={16} aria-hidden="true" />
          <div className="stat stat-last"><span className="stat-number">{padding ? '='.repeat(padding) : '—'}</span><span>{padding ? `${padding} padding ${padding === 1 ? 'mark' : 'marks'}` : 'no padding'}</span></div>
        </section>

        <section className="breakdown-section" aria-labelledby="breakdown-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow"><span>02</span> THE BREAKDOWN</p>
              <h2 id="breakdown-title">Bytes, then <em>Base64.</em></h2>
            </div>
          </div>

          <article className="process-step character-step">
            <div className="step-heading step-heading-wide">
              <div className="step-heading-main"><span className="step-number">1</span><div><h3>Characters become UTF-8 bytes</h3><p>Each character has a Unicode number; UTF-8 turns that number into one or more bytes.</p></div></div>
              {result.characters > PREVIEW_CHARACTERS && (
                <button className="details-button" type="button" onClick={() => dialogRef.current?.showModal()}>
                  View all {result.characters} characters <ChevronRight size={16} />
                </button>
              )}
            </div>
            <CharacterTable characters={previewCharacters} />
            {result.characters > PREVIEW_CHARACTERS && (
              <p className="preview-note">Showing the first {PREVIEW_CHARACTERS} characters. Open the full trace to inspect the rest.</p>
            )}
          </article>

          <article className="process-step group-step">
            <div className="step-heading step-heading-wide">
              <div className="step-heading-main"><span className="step-number">2</span><div><h3>Three bytes become four six-bit groups</h3><p>Base64 works with 6-bit values, not 8-bit bytes.</p></div></div>
              {result.blocks.length > PREVIEW_BLOCKS && (
                <button className="details-button" type="button" onClick={() => dialogRef.current?.showModal()}>
                  View all {result.blocks.length} blocks <ChevronRight size={16} />
                </button>
              )}
            </div>

            <div className="bit-concept">
              <div className="bit-equation">
                <div className="bit-example">
                  <div className="byte-token-row">
                    {firstBlockBytes.map((byte, index) => (
                      <code className={byte.virtual ? 'zero-fill-token' : ''} key={index}>{toBinary(byte.value)}</code>
                    ))}
                  </div>
                  <span>3 bytes · 24 bits</span>
                </div>
                <ArrowRight className="equation-arrow" size={17} aria-hidden="true" />
                <div className="six-bit-example">
                  {(result.blocks[0]?.sextets ?? Array.from({ length: 4 }, () => ({ bits: '000000' }))).map((sextet, index) => (
                    <span className="six-bit-token" key={index}>{sextet.bits}</span>
                  ))}
                  <span className="six-bit-caption">4 groups · 6 bits each</span>
                </div>
              </div>
              <p><strong>Why 6 bits?</strong> Normal bytes are 8 bits. Base64 combines three bytes, then splits the 24-bit block into four 6-bit groups. <code>2<sup>6</sup> = 64</code>, so each group maps to one of 64 Base64 characters.</p>
            </div>

            <div className="mapping-guide" aria-label="Base64 character ranges">
              <div><span>0–25</span><strong>A–Z</strong></div>
              <div><span>26–51</span><strong>a–z</strong></div>
              <div><span>52–61</span><strong>0–9</strong></div>
              <div><span>62–63</span><strong>+ /</strong></div>
              <p><span>INDEX EXAMPLE</span><code>53 → 1</code><code>38 → m</code><code>21 → V</code><code>37 → l</code></p>
            </div>

            {previewBlocks.length ? (
              <div className="groups-preview">
                {previewBlocks.map((block, index) => <ByteGroup block={block} number={index + 1} key={block.firstByte} />)}
              </div>
            ) : <p className="empty-step">Enter text to see the six-bit groups.</p>}
          </article>

          <div className="padding-note">
            <span className="padding-icon" aria-hidden="true">=</span>
            <p>
              {padding
                ? <><strong>Why does {'='.repeat(padding)} appear at the end?</strong> The input has {result.bytes.length} bytes: {result.bytes.length} % 3 = {remainder}, leaving {remainder} byte{remainder === 1 ? '' : 's'} in the last block. Base64 reserves four output positions for every three input bytes. This block produces {4 - padding} real Base64 character{4 - padding === 1 ? '' : 's'} and {padding} padding mark{padding === 1 ? '' : 's'}. Zero bits complete the 24-bit calculation; “=” marks unused output positions, so a decoder can recover the original byte count. The zero-fill is not input data.</>
                : <><strong>No padding needed.</strong> The input has a whole number of three-byte blocks, so every Base64 output position represents input data.</>}
            </p>
          </div>

          <p className="encoding-note">Base64 is reversible encoding, not encryption. Anyone can decode the result without a key.</p>
        </section>
      </main>

      <footer className="page-footer"><span>TEXT → BYTES → BASE64</span><span>LOCAL ONLY <span className="footer-divider">·</span> NOTHING IS SENT</span></footer>

      <dialog className="details-dialog" ref={dialogRef} onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close()
      }}>
        <div className="dialog-header">
          <div><p className="eyebrow"><span>FULL TRACE</span></p><h2>Every character, <em>accounted for.</em></h2></div>
          <button className="icon-button dialog-close" type="button" aria-label="Close full breakdown" onClick={() => dialogRef.current?.close()}><X size={19} /></button>
        </div>
        <div className="dialog-content">
          <section className="dialog-section">
            <h3>Character to UTF-8 byte conversion</h3>
            <CharacterTable characters={result.characterDetails} />
          </section>
          <section className="dialog-section">
            <h3>Three-byte blocks to six-bit groups</h3>
            <div className="dialog-blocks">
              {result.blocks.length ? result.blocks.map((block, index) => <ByteGroup block={block} number={index + 1} key={block.firstByte} />) : <p className="empty-step">Enter text to see the full trace.</p>}
            </div>
          </section>
        </div>
        <div className="dialog-result"><span>RESULT</span><code>{result.encoded || '—'}</code></div>
      </dialog>
    </div>
  )
}

export default App
