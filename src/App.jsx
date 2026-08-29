
import { useEffect, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { pdfjs, Document, Page } from 'react-pdf'
import { Chess } from 'chess.js'

pdfjs.GlobalWorkerOptions.workerSrc =
  `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const INITIAL_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const theme = {
  bg: '#161512',
  panel: '#262421',
  text: '#bababa',
  title: '#ffffff',
  accent: '#7fa650',
  accentHover: '#8cb758',
  border: '#3d3b37',
  boardShadow: '0 12px 28px rgba(0,0,0,0.6)'
}


/* ============================================================
   FEN HELPERS
   ============================================================ */

function squareToIndex(square) {
  if (
    typeof square !== 'string' ||
    !/^[a-h][1-8]$/.test(square)
  ) {
    return null
  }

  return [
    8 - Number(square[1]),
    square.charCodeAt(0) - 97
  ]
}


function fenToGrid(fen) {
  try {
    const boardPart =
      fen.trim().split(/\s+/)[0]

    const rows =
      boardPart.split('/')

    if (rows.length !== 8) {
      return null
    }

    const grid = []

    for (const row of rows) {
      const cells = []

      for (const char of row) {
        if (/[1-8]/.test(char)) {
          for (
            let i = 0;
            i < Number(char);
            i++
          ) {
            cells.push(null)
          }
        } else if (
          'KQRBNPkqrbnp'.includes(char)
        ) {
          cells.push(char)
        } else {
          return null
        }
      }

      if (cells.length !== 8) {
        return null
      }

      grid.push(cells)
    }

    return grid

  } catch {
    return null
  }
}


function gridToFen(grid) {
  return grid.map(row => {

    let result = ''
    let empty = 0

    for (const cell of row) {

      if (!cell) {
        empty++
      } else {

        if (empty > 0) {
          result += empty
          empty = 0
        }

        result += cell
      }
    }

    if (empty > 0) {
      result += empty
    }

    return result

  }).join('/')
}


/* ============================================================
   EDIT MODE
   ============================================================ */

function editPosition(
  currentFen,
  sourceSquare,
  targetSquare,
  piece
) {
  /*
   * Convert the current FEN into an 8x8 board.
   */
  let grid = fenToGrid(currentFen)

  /*
   * If the FEN is malformed, create an empty board
   * instead of allowing Edit Mode to crash.
   */
  if (!grid) {
    grid = Array.from(
      { length: 8 },
      () => Array(8).fill(null)
    )
  }

  /*
   * Get the source square coordinates.
   */
  const source =
    squareToIndex(sourceSquare)

  /*
   * Get the target square coordinates.
   */
  const target =
    squareToIndex(targetSquare)

  if (!source || !target) {
    return currentFen
  }

  const [sourceRow, sourceCol] =
    source

  const [targetRow, targetCol] =
    target

  /*
   * IMPORTANT:
   *
   * Do NOT depend entirely on the `piece` argument.
   *
   * Read the actual piece from our FEN first.
   *
   * Example:
   *
   * e4 contains "P"
   * e6 becomes "P"
   */
  let movingPiece =
    grid[sourceRow][sourceCol]

  /*
   * If the FEN didn't contain a piece at the source,
   * fall back to react-chessboard's piece value.
   */
  if (!movingPiece && piece) {

    if (
      typeof piece === 'string' &&
      piece.length >= 2
    ) {

      const color =
        piece[0]

      const type =
        piece[1].toUpperCase()

      if (
        (color === 'w' || color === 'b') &&
        'KQRBNP'.includes(type)
      ) {

        movingPiece =
          color === 'w'
            ? type
            : type.toLowerCase()
      }
    }
  }

  /*
   * Nothing to move.
   */
  if (!movingPiece) {
    return currentFen
  }

  /*
   * Remove the piece from its old square.
   */
  grid[sourceRow][sourceCol] =
    null

  /*
   * Put the piece on the new square.
   *
   * If another piece is already there,
   * it is intentionally replaced.
   */
  grid[targetRow][targetCol] =
    movingPiece


  /*
   * Rebuild the board portion of the FEN.
   */
  const boardFen =
    gridToFen(grid)


  /*
   * Preserve side-to-move.
   *
   * Castling and en-passant information are reset
   * because Edit Mode is deliberately free-form.
   */
  const parts =
    currentFen
      .trim()
      .split(/\s+/)

  while (parts.length < 6) {
    parts.push('-')
  }

  parts[0] =
    boardFen

  parts[2] =
    '-'

  parts[3] =
    '-'

  parts[4] =
    '0'

  return parts.join(' ')
}

/* ============================================================
   LOADER
   ============================================================ */

function KnightLoader() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        backgroundColor: theme.panel,
        padding: '30px 50px',
        borderRadius: '12px',
        boxShadow: theme.boardShadow
      }}
    >
      <style>
        {`
          @keyframes knightJump {
            0%, 100% {
              transform: translateY(0) scale(1);
            }

            50% {
              transform: translateY(-20px) scale(1.1);
            }
          }
        `}
      </style>

      <div
        style={{
          fontSize: '56px',
          color: theme.accent,
          animation:
            'knightJump 0.6s infinite ease-in-out',
          display: 'inline-block',
          lineHeight: '1'
        }}
      >
        ♞
      </div>

      <div
        style={{
          color: theme.title,
          fontWeight: 'bold',
          fontSize: '16px'
        }}
      >
        Analyzing Position...
      </div>
    </div>
  )
}


/* ============================================================
   APP
   ============================================================ */




function App() {

  /*
   * FEN is now the SINGLE source of truth.
   *
   * There is deliberately NO:
   *
   * const [game, setGame] = ...
   *
   * and NO useEffect synchronizing a second game object.
   */
  const [fen, setFen] =
    useState(INITIAL_FEN)

  const [orientation, setOrientation] =
    useState('white')

  const [loading, setLoading] =
    useState(false)

  const [file, setFile] =
    useState(null)

  const [numPages, setNumPages] =
    useState(null)

  const [copied, setCopied] =
    useState(false)

  const [isEditMode, setIsEditMode] =
    useState(false)

  // Edit-mode tool used for adding/removing pieces.
  // Dragging pieces continues to use handlePieceDrop below.
  const [editorTool, setEditorTool] =
    useState(null)

  /*
   * Validation message shown when an edited position
   * cannot be saved as a valid chess position.
   */
  const [editError, setEditError] =
    useState('')

  /*
   * Only a NEW PDF scan increments this.
   *
   * It is NOT changed by normal moves.
   */
  const [scanVersion, setScanVersion] =
    useState(0)

  /*
   * Stockfish evaluation.
   *
   * The engine runs in a Web Worker so analysis does not freeze
   * the React UI. The lite single-threaded Stockfish 18 build is
   * used because it is much smaller than the full browser build.
   */
  const [stockfishEnabled, setStockfishEnabled] =
    useState(false)

  const [stockfishEval, setStockfishEval] =
    useState(null)

  const [engineLines, setEngineLines] =
    useState([])

  const stockfishWorkerRef =
    useRef(null)

  const stockfishRequestRef =
    useRef(0)


  const isBlackToMove =
    fen.trim().split(/\s+/)[1] === 'b'


  /* ==========================================================
     FILE
     ========================================================== */

  function onFileChange(event) {

    const selectedFile =
      event.target.files?.[0]

    if (selectedFile) {
      setFile(selectedFile)
      setNumPages(null)
    }
  }


  /* ==========================================================
     TURN
     ========================================================== */

  function handleTurnChange(
    newTurnLetter
  ) {

    setFen(currentFen => {

      const parts =
        currentFen.trim().split(/\s+/)

      while (parts.length < 6) {
        parts.push('-')
      }

      parts[1] =
        newTurnLetter === 'b'
          ? 'b'
          : 'w'

      return parts.join(' ')
    })
  }


  /* ==========================================================
     COPY FEN
     ========================================================== */

  async function handleCopyFen() {

    try {

      await navigator.clipboard.writeText(
        fen
      )

      setCopied(true)

      setTimeout(
        () => setCopied(false),
        2000
      )

    } catch (error) {

      console.error(
        'Clipboard error:',
        error
      )
    }
  }


  /* ==========================================================
     PLAY MODE
     ========================================================== */

function makeLegalMove(sourceSquare, targetSquare) {
  try {
    console.log("PLAY MOVE");
    console.log("Current FEN:", fen);
    console.log("From:", sourceSquare);
    console.log("To:", targetSquare);

    const gameCopy = new Chess(fen, {
      skipValidation: true
    });

    console.log("Chess position loaded");

    const move = gameCopy.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q"
    });

    console.log("Move result:", move);

    if (!move) {
      console.warn(
        "Chess.js rejected the move:",
        sourceSquare,
        "->",
        targetSquare
      );

      return false;
    }

    const newFen = gameCopy.fen();

    console.log("NEW FEN:", newFen);

    setFen(newFen);

    return true;

  } catch (error) {
    console.error(
      "PLAY MODE ERROR:",
      error
    );

    return false;
  }
}


  /* ==========================================================
     PIECE DROP
     ========================================================== */

  /*
   * IMPORTANT FOR react-chessboard 5.x:
   *
   * onPieceDrop receives ONE OBJECT:
   *
   * {
   *   piece,
   *   sourceSquare,
   *   targetSquare
   * }
   *
   * Your old code expected three positional arguments.
   */
  function handlePieceDrop({
    piece,
    sourceSquare,
    targetSquare
  }) {

    console.log(
      'Piece drop',
      {
        piece,
        sourceSquare,
        targetSquare,
        editMode: isEditMode
      }
    )


    /* --------------------------------------------------------
       EDIT MODE
       -------------------------------------------------------- */

    if (isEditMode) {

      const newFen =
        editPosition(
          fen,
          sourceSquare,
          targetSquare,
          piece
        )

      setFen(newFen)

      /*
       * Accept the drag.
       *
       * The actual board position is controlled by `fen`.
       */
      return true
    }


    /* --------------------------------------------------------
       PLAY MODE
       -------------------------------------------------------- */

    return makeLegalMove(
      sourceSquare,
      targetSquare
    )
  }


  /* ==========================================================
     EDIT MODE: ADD / REMOVE PIECES
     ========================================================== */

  function pieceFromTool(tool) {
    const map = {
      wK: 'K',
      wQ: 'Q',
      wR: 'R',
      wB: 'B',
      wN: 'N',
      wP: 'P',
      bK: 'k',
      bQ: 'q',
      bR: 'r',
      bB: 'b',
      bN: 'n',
      bP: 'p'
    }

    return map[tool] || null
  }

  function updateEditSquare(square, pieceChar) {
    const grid = fenToGrid(fen)

    if (!grid) return

    const index = squareToIndex(square)

    if (!index) return

    const [row, col] = index

    grid[row][col] = pieceChar || null

    const parts = fen.trim().split(/\\s+/)

    while (parts.length < 6) {
      parts.push('-')
    }

    parts[0] = gridToFen(grid)

    /* Any position changed in Edit Mode defaults to White to move. */
    parts[1] = 'w'

    parts[2] = '-'
    parts[3] = '-'
    parts[4] = '0'

    setFen(parts.join(' '))

    /*
     * A board change means the user is correcting the position,
     * so remove the previous validation message.
     */
    setEditError('')
  }

  function handleSquareClick({ square }) {
    if (!isEditMode || !square) return

    if (editorTool === 'trash') {
      updateEditSquare(square, null)
      return
    }

    const pieceChar = pieceFromTool(editorTool)

    if (pieceChar) {
      updateEditSquare(square, pieceChar)
    }
  }

  /* ==========================================================
     PDF CLICK
     ========================================================== */

  function handlePageClick(event) {

    /*
     * PDF positions can only be selected in Play Mode.
     * While Edit Mode is active, clicking another page/image
     * must not replace the position currently being edited.
     */
    if (isEditMode || loading) {
      return
    }


    const canvas =
      event.currentTarget.querySelector(
        'canvas'
      )

    if (!canvas) {
      return
    }


    const rect =
      canvas.getBoundingClientRect()


    if (
      !rect.width ||
      !rect.height
    ) {
      return
    }


    const scaleX =
      canvas.width /
      rect.width

    const scaleY =
      canvas.height /
      rect.height


    const clickX =
      (event.clientX -
        rect.left) *
      scaleX

    const clickY =
      (event.clientY -
        rect.top) *
      scaleY


    setLoading(true)


    canvas.toBlob(
      async blob => {

        if (!blob) {
          setLoading(false)
          return
        }


        const formData =
          new FormData()


        formData.append(
          'image',
          blob,
          'full-page.png'
        )


        formData.append(
          'x',
          String(clickX)
        )


        formData.append(
          'y',
          String(clickY)
        )


        try {

          const response =
            await fetch(
              'http://localhost:8000/extract-click',
              {
                method: 'POST',
                body: formData
              }
            )


          const data =
            await response.json()


          if (data.error) {

            console.warn(
              'Ignored click:',
              data.error
            )

          } else if (
            typeof data.fen === 'string' &&
            data.fen.trim()
          ) {

            /*
             * New scanner position.
             */
            setFen(
              data.fen.trim()
            )

            /*
             * Deliberate board refresh ONLY for scanner
             * positions.
             */
            setScanVersion(
              value => value + 1
            )
          }

        } catch (error) {

          console.error(
            'Backend fetch error:',
            error
          )

        } finally {

          setLoading(false)
        }

      },
      'image/png'
    )
  }


  /* ==========================================================
     CHESSBOARD OPTIONS
     ========================================================== */

  /* ==========================================================
     STOCKFISH ENGINE
     ========================================================== */

  const fenRef = useRef(fen)

  const stockfishReadyRef =
    useRef(false)

  const stockfishGenerationRef =
    useRef(0)

  useEffect(() => {
    fenRef.current = fen
  }, [fen])


  /*
   * Send one complete analysis request.
   *
   * We deliberately use "go movetime" rather than relying on a
   * depth-only search. This guarantees that the browser receives
   * a fresh score within a predictable time after every move.
   */
  function analyseCurrentPosition(worker) {
    if (
      !worker ||
      !stockfishReadyRef.current ||
      isEditMode ||
      !stockfishEnabled
    ) {
      return
    }

    const currentFen =
      fenRef.current.trim()

    try {
      new Chess(currentFen)
    } catch {
      setStockfishEval(null)
      return
    }

    const generation =
      ++stockfishGenerationRef.current

    setStockfishEval(null)
    setEngineLines([])

    try {
      worker.postMessage('stop')
      worker.postMessage('ucinewgame')
      worker.postMessage(
        `position fen ${currentFen}`
      )
      worker.postMessage(
        'go movetime 700'
      )
    } catch (error) {
      console.error(
        'Stockfish analysis error:',
        error
      )
    }

    return generation
  }


  useEffect(() => {
    if (!stockfishEnabled) {
      stockfishReadyRef.current =
        false

      if (stockfishWorkerRef.current) {
        try {
          stockfishWorkerRef.current.postMessage('stop')
          stockfishWorkerRef.current.postMessage('quit')
          stockfishWorkerRef.current.terminate()
        } catch {
          // Ignore worker shutdown errors.
        }
      }

      stockfishWorkerRef.current =
        null

      setStockfishEval(null)
      setEngineLines([])
      return undefined
    }

    let destroyed = false

    stockfishReadyRef.current =
      false

    /*
     * Stockfish.js explicitly recommends using the browser build
     * through a Web Worker. The lite single-threaded build is the
     * recommended small browser build.
     */
    const worker =
      new Worker(
        '/stockfish/stockfish-18-lite-single.js'
      )

    stockfishWorkerRef.current =
      worker

    worker.onmessage = event => {
      if (destroyed) {
        return
      }

      const line =
        typeof event.data === 'string'
          ? event.data.trim()
          : String(event.data || '').trim()

      if (!line) {
        return
      }

      if (line === 'uciok') {
        worker.postMessage(
          'setoption name MultiPV value 2'
        )
        worker.postMessage('isready')
        return
      }

      if (line === 'readyok') {
        stockfishReadyRef.current =
          true

        if (!isEditMode) {
          analyseCurrentPosition(worker)
        }

        return
      }

      if (
        isEditMode ||
        !stockfishReadyRef.current ||
        !line.startsWith('info ') ||
        !line.includes(' score ')
      ) {
        return
      }

      const currentFen =
        fenRef.current.trim()

      const sideToMove =
        currentFen
          .split(/\s+/)[1] || 'w'

      const multiPvMatch =
        line.match(/multipv\s+(\d+)/)

      const multiPv =
        multiPvMatch
          ? Number(multiPvMatch[1])
          : 1

      const depthMatch =
        line.match(/depth\s+(\d+)/)

      const depth =
        depthMatch
          ? Number(depthMatch[1])
          : 0

      const pvMatch =
        line.match(/\spv\s+(.+)$/)

      const pv =
        pvMatch
          ? pvMatch[1].trim().split(/\s+/)
          : []

      if (!pv.length) {
        return
      }

      const mateMatch =
        line.match(
          /score mate (-?\d+)/
        )

      const cpMatch =
        line.match(
          /score cp (-?\d+)/
        )

      let scoreText = '0.0'
      let whiteScore = 0

      if (mateMatch) {
        const mate =
          Number(mateMatch[1])

        whiteScore =
          sideToMove === 'b'
            ? -mate
            : mate

        scoreText =
          whiteScore > 0
            ? `M${Math.abs(whiteScore)}`
            : `-M${Math.abs(whiteScore)}`
      } else if (cpMatch) {
        const cp =
          Number(cpMatch[1])

        const whiteCp =
          sideToMove === 'b'
            ? -cp
            : cp

        whiteScore =
          whiteCp / 100

        scoreText =
          `${
            whiteScore >= 0
              ? '+'
              : ''
          }${whiteScore.toFixed(1)}`
      } else {
        return
      }

      const pvText =
        formatEnginePV(
          currentFen,
          pv
        )

      setEngineLines(previous => {
        const updated =
          previous.filter(
            item =>
              item.multipv !==
              multiPv
          )

        updated.push({
          multipv: multiPv,
          depth,
          score: scoreText,
          whiteScore,
          line: pvText
        })

        return updated
          .sort(
            (a, b) =>
              a.multipv -
              b.multipv
          )
          .slice(0, 2)
      })

      if (multiPv === 1) {
        setStockfishEval({
          type:
            mateMatch
              ? 'mate'
              : 'cp',
          value:
            whiteScore
        })
      }
    }

    worker.onerror = error => {
      console.error(
        'Stockfish worker error:',
        error
      )

      stockfishReadyRef.current =
        false

      setStockfishEval(null)
    }

    worker.postMessage('uci')

    return () => {
      destroyed = true
      stockfishReadyRef.current =
        false

      try {
        worker.postMessage('stop')
        worker.postMessage('quit')
        worker.terminate()
      } catch {
        // Ignore.
      }

      if (
        stockfishWorkerRef.current ===
        worker
      ) {
        stockfishWorkerRef.current =
          null
      }
    }
  }, [stockfishEnabled])


  /*
   * FEN is the single source of truth for the board. Therefore
   * every move, turn change, scan, reset, or saved edit naturally
   * reaches this effect.
   */
  useEffect(() => {
    if (
      !stockfishEnabled ||
      !stockfishWorkerRef.current ||
      !stockfishReadyRef.current ||
      isEditMode
    ) {
      if (isEditMode && stockfishEnabled) {
        setStockfishEval(null)
      }

      return undefined
    }

    const timer =
      setTimeout(() => {
        if (
          stockfishWorkerRef.current &&
          stockfishReadyRef.current &&
          !isEditMode
        ) {
          analyseCurrentPosition(
            stockfishWorkerRef.current
          )
        }
      }, 25)

    return () => {
      clearTimeout(timer)
    }
  }, [
    fen,
    stockfishEnabled,
    isEditMode
  ])


  function formatEnginePV(currentFen, pv) {
    if (!pv || !pv.length) {
      return ''
    }

    try {
      const game =
        new Chess(currentFen)

      const sanMoves = []

      for (const uci of pv) {
        if (uci.length < 4) {
          break
        }

        const move =
          game.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion:
              uci[4] || undefined
          })

        if (!move) {
          break
        }

        sanMoves.push(move.san)
      }

      return sanMoves.join(' ')
    } catch {
      return pv.join(' ')
    }
  }


  function formatStockfishEval() {
    if (!stockfishEval) {
      return '0.0'
    }

    if (
      stockfishEval.type === 'mate'
    ) {
      return stockfishEval.value > 0
        ? `M${Math.abs(stockfishEval.value)}`
        : `-M${Math.abs(stockfishEval.value)}`
    }

    const value =
      Math.max(
        -99,
        Math.min(
          99,
          stockfishEval.value
        )
      )

    return `${
      value >= 0 ? '+' : ''
    }${value.toFixed(1)}`
  }


  function getEvaluationPercent() {
    if (!stockfishEval) {
      return 50
    }

    if (
      stockfishEval.type === 'mate'
    ) {
      return stockfishEval.value > 0
        ? 100
        : 0
    }

    /*
     * Smooth centipawn -> bar percentage mapping.
     * 50% = equal.
     */
    const cp =
      stockfishEval.value * 100

    const percentage =
      50 +
      50 *
        (
          2 /
          (
            1 +
            Math.exp(
              -cp / 180
            )
          ) -
          1
        )

    return Math.max(
      2,
      Math.min(
        98,
        percentage
      )
    )
  }


  /* ==========================================================
     CHESSBOARD OPTIONS
     ========================================================== */

  const chessboardOptions = {

    /*
     * Controlled position.
     */
    position:
      fen,

    boardOrientation:
      orientation,

    showAnimations:
      false,

    animationDurationInMs:
      0,

    allowDragging:
      true,

    /*
     * THIS IS THE IMPORTANT v5 CALLBACK.
     */
    onPieceDrop:
      handlePieceDrop,

    onSquareClick:
      handleSquareClick,

    darkSquareStyle: {
      backgroundColor:
        '#739552'
    },

    lightSquareStyle: {
      backgroundColor:
        '#ebecd0'
    }
  }


  /* ==========================================================
     RESET BOARD
     ========================================================== */

  function handleResetBoard() {
    setFen(INITIAL_FEN)
    setIsEditMode(false)
    setEditorTool(null)
    setEditError('')
  }


  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100%',
        fontFamily:
          '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        backgroundColor:
          theme.bg,
        color:
          theme.text,
        overflow:
          'hidden'
      }}
    >

      {/* ======================================================
          PDF PANEL
          ====================================================== */}

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight:
            `1px solid ${theme.border}`,
          overflow:
            'hidden'
        }}
      >

        <div
          style={{
            backgroundColor:
              theme.panel,
            padding:
              '16px 24px',
            display:
              'flex',
            justifyContent:
              'space-between',
            alignItems:
              'center',
            borderBottom:
              `1px solid ${theme.border}`
          }}
        >

          <h1
            style={{
              color:
                theme.title,
              margin:
                0,
              fontSize:
                '22px',
              display:
                'flex',
              alignItems:
                'center',
              gap:
                '10px'
            }}
          >

            <span
              style={{
                fontSize:
                  '28px',
                color:
                  theme.accent
              }}
            >
              ♞
            </span>

            ChessScanner

          </h1>


          <label
            style={{
              backgroundColor:
                theme.accent,
              color:
                'white',
              padding:
                '8px 16px',
              borderRadius:
                '4px',
              fontWeight:
                '600',
              cursor:
                'pointer',
              fontSize:
                '14px',
              whiteSpace:
                'nowrap'
            }}
          >

            Upload PDF

            <input
              type="file"
              accept="application/pdf"
              onChange={
                onFileChange
              }
              style={{
                display:
                  'none'
              }}
            />

          </label>

        </div>


        <div
          style={{
            flex: 1,
            overflowY:
              'auto',
            overflowX:
              'hidden',
            backgroundColor:
              '#1e1d1a'
          }}
        >

          {loading && (

            <div
              style={{
                position:
                  'fixed',
                top:
                  0,
                left:
                  0,
                right:
                  '450px',
                bottom:
                  0,
                zIndex:
                  999,
                display:
                  'flex',
                justifyContent:
                  'center',
                alignItems:
                  'center',
                pointerEvents:
                  'none'
              }}
            >
              <KnightLoader />
            </div>

          )}


          <div
            style={{
              padding:
                '30px 0',
              display:
                'flex',
              flexDirection:
                'column',
              alignItems:
                'center'
            }}
          >

            {file ? (

              <Document
                file={
                  file
                }
                onLoadSuccess={({
                  numPages
                }) =>
                  setNumPages(
                    numPages
                  )
                }
              >

                {Array.from(
                  new Array(
                    numPages || 0
                  ),
                  (_, index) => (

                    <div
                      key={
                        `page_${index + 1}`
                      }
                      onClick={
                        handlePageClick
                      }
                      style={{
                        marginBottom:
                          '24px',
                        cursor:
                          isEditMode
                            ? 'not-allowed'
                            : loading
                              ? 'wait'
                              : 'pointer',
                        pointerEvents:
                          isEditMode
                            ? 'none'
                            : 'auto',
                        opacity:
                          isEditMode
                            ? 0.72
                            : 1,
                        boxShadow:
                          '0 8px 24px rgba(0,0,0,0.5)',
                        backgroundColor:
                          'white',
                        maxWidth:
                          '90%',
                        transition:
                          'opacity 0.2s ease'
                      }}
                    >

                      <Page
                        pageNumber={
                          index + 1
                        }
                        renderTextLayer={
                          false
                        }
                        renderAnnotationLayer={
                          false
                        }
                        width={
                          450
                        }
                      />

                    </div>

                  )
                )}

              </Document>

            ) : (

              <div
                style={{
                  marginTop:
                    '20vh',
                  textAlign:
                    'center',
                  color:
                    '#666'
                }}
              >

                <div
                  style={{
                    fontSize:
                      '64px',
                    marginBottom:
                      '16px'
                  }}
                >
                  📄
                </div>

                <p
                  style={{
                    fontSize:
                      '18px'
                  }}
                >
                  Upload a chess book to start scanning
                </p>

              </div>

            )}

          </div>

        </div>

      </div>


      {/* ======================================================
          CHESS PANEL
          ====================================================== */}

      <div
        style={{
          flex:
            '0 0 450px',
          boxSizing:
            'border-box',
          backgroundColor:
            theme.panel,
          padding:
            '30px',
          display:
            'flex',
          flexDirection:
            'column',
          overflowY:
            'auto',
          overflowX:
            'hidden'
        }}
      >

        <div
          style={{
            width:
              '100%',
            marginBottom:
              '24px',
            display:
              'flex',
            justifyContent:
              'space-between',
            alignItems:
              'flex-end'
          }}
        >

          <h2
            style={{
              color:
                theme.title,
              fontSize:
                '20px',
              margin:
                0
            }}
          >
            Extracted Position
          </h2>


          {isEditMode && (

            <span
              style={{
                fontSize:
                  '12px',
                color:
                  theme.accent,
                fontWeight:
                  'bold',
                textTransform:
                  'uppercase',
                letterSpacing:
                  '1px'
              }}
            >
              ● Editing Board
            </span>

          )}

        </div>


        {/* ====================================================
            CHESSBOARD

            NO key={fen}

            The board remains mounted while the user moves
            pieces.

            scanVersion changes only when a new PDF scan arrives.
        ==================================================== */}

        {isEditMode && editError && (
          <div
            role="alert"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              marginBottom: '8px',
              padding: '9px 11px',
              borderRadius: '6px',
              border: '1px solid #b85c5c',
              backgroundColor: '#3a2222',
              color: '#f2b8b8',
              fontSize: '11px',
              lineHeight: '1.45',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              boxShadow: '0 3px 10px rgba(0,0,0,0.25)'
            }}
          >
            <span
              style={{
                width: '18px',
                height: '18px',
                flexShrink: 0,
                borderRadius: '50%',
                backgroundColor: '#c85c5c',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: '700'
              }}
            >
              !
            </span>

            <span>{editError}</span>
          </div>
        )}

        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {isEditMode && (
            <div
              style={{
                display: 'flex',
                gap: '6px',
                alignItems: 'center',
                marginBottom: '6px'
              }}
            >
              <div
                style={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 1fr)',
                  gap: '5px'
                }}
              >
                {(orientation === 'white'
                  ? [
                      ['bK', '♚'],
                      ['bQ', '♛'],
                      ['bR', '♜'],
                      ['bB', '♝'],
                      ['bN', '♞'],
                      ['bP', '♟']
                    ]
                  : [
                      ['wK', '♔'],
                      ['wQ', '♕'],
                      ['wR', '♖'],
                      ['wB', '♗'],
                      ['wN', '♘'],
                      ['wP', '♙']
                    ]
                ).map(([tool, symbol]) => (
                  <button
                    key={tool}
                    type="button"
                    title={`Add ${tool}`}
                    onClick={() =>
                      setEditorTool(value =>
                        value === tool ? null : tool
                      )
                    }
                    style={{
                      height: '32px',
                      padding: 0,
                      borderRadius: '5px',
                      border: `1px solid ${
                        editorTool === tool
                          ? theme.accent
                          : theme.border
                      }`,
                      backgroundColor:
                        editorTool === tool
                          ? theme.accent
                          : '#BCCCBC',
                      color:
                        tool[0] === 'w'
                          ? '#FFFFFF'
                          : '#000000',
                      fontSize: '22px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {symbol}
                  </button>
                ))}
              </div>

              <button
                type="button"
                title="Remove piece"
                onClick={() =>
                  setEditorTool(value =>
                    value === 'trash' ? null : 'trash'
                  )
                }
                style={{
                  width: '32px',
                  height: '32px',
                  flexShrink: 0,
                  padding: 0,
                  borderRadius: '5px',
                  border: `1px solid ${
                    editorTool === 'trash'
                      ? '#c85c5c'
                      : theme.border
                  }`,
                  backgroundColor:
                    editorTool === 'trash'
                      ? '#c85c5c'
                      : theme.panel,
                  color: '#fff',
                  fontSize: '15px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                🗑
              </button>
            </div>
          )}

          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'stretch',
              position: 'relative'
            }}
          >
            {stockfishEnabled && (
              <div
                title={`Stockfish: ${formatStockfishEval()}`}
                style={{
                  width: '22px',
                  flexShrink: 0,
                  position: 'relative',
                  overflow: 'hidden',
                  order: 0,
                  borderRadius:
                    '4px 0 0 4px',
                  backgroundColor:
                    '#111',
                  boxShadow:
                    theme.boardShadow
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    height:
                      `${getEvaluationPercent()}%`,
                    top:
                      orientation === 'black'
                        ? 0
                        : 'auto',
                    bottom:
                      orientation === 'white'
                        ? 0
                        : 'auto',
                    backgroundColor:
                      '#f4f4f4',
                    transition:
                      'height 0.35s ease'
                  }}
                />

                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform:
                      'translate(-50%, -50%)',
                    zIndex: 2,
                    fontSize: '8px',
                    fontWeight: '800',
                    lineHeight: 1,
                    color:
                      getEvaluationPercent() >= 50
                        ? '#111'
                        : '#fff',
                    textShadow:
                      getEvaluationPercent() >= 50
                        ? 'none'
                        : '0 1px 2px rgba(0,0,0,0.8)',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none'
                  }}
                >
                  {formatStockfishEval()}
                </div>
              </div>
            )}

            <div
              style={{
                flex: 1,
                minWidth: 0,
                boxShadow: theme.boardShadow,
                borderRadius:
                  stockfishEnabled
                    ? '0 4px 4px 0'
                    : '4px'
              }}
            >
              <Chessboard
                key={`scan-${scanVersion}`}
                options={chessboardOptions}
              />
            </div>
          </div>

          {stockfishEnabled && (
            <div
              style={{
                marginTop: '8px',
                width: '100%',
                backgroundColor:
                  theme.panel,
                border:
                  `1px solid ${theme.border}`,
                borderRadius: '6px',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  padding: '7px 10px 6px',
                  fontSize: '10px',
                  fontWeight: '700',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  color: theme.muted
                }}
              >
                Engine Lines
              </div>

              {[1, 2].map(number => {
                const item =
                  engineLines.find(
                    entry =>
                      entry.multipv ===
                      number
                  )

                return (
                  <div
                    key={number}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '7px 10px',
                      borderTop:
                        `1px solid ${theme.border}`,
                      minHeight: '31px'
                    }}
                  >
                    <div
                      style={{
                        width: '15px',
                        flexShrink: 0,
                        fontSize: '10px',
                        fontWeight: '800',
                        color: theme.muted
                      }}
                    >
                      {number}.
                    </div>

                    <div
                      style={{
                        width: '40px',
                        flexShrink: 0,
                        fontSize: '11px',
                        fontWeight: '700',
                        color: '#d7dde3'
                      }}
                    >
                      {item
                        ? item.score
                        : '—'}
                    </div>

                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                        fontSize: '11px',
                        lineHeight: '1.45',
                        color:
                          item
                            ? '#d7dde3'
                            : theme.muted,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                      title={
                        item
                          ? item.line
                          : 'Waiting for Stockfish...'
                      }
                    >
                      {item
                        ? item.line
                        : 'Waiting for Stockfish...'}
                    </div>

                    {item && (
                      <div
                        style={{
                          flexShrink: 0,
                          fontSize: '9px',
                          color: theme.muted
                        }}
                      >
                        d{item.depth}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}


          {isEditMode && (
            <div
              style={{
                display: 'flex',
                gap: '6px',
                alignItems: 'center',
                marginTop: '6px'
              }}
            >
              <div
                style={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 1fr)',
                  gap: '5px'
                }}
              >
                {(orientation === 'white'
                  ? [
                      ['wK', '♔'],
                      ['wQ', '♕'],
                      ['wR', '♖'],
                      ['wB', '♗'],
                      ['wN', '♘'],
                      ['wP', '♙']
                    ]
                  : [
                      ['bK', '♚'],
                      ['bQ', '♛'],
                      ['bR', '♜'],
                      ['bB', '♝'],
                      ['bN', '♞'],
                      ['bP', '♟']
                    ]
                ).map(([tool, symbol]) => (
                  <button
                    key={tool}
                    type="button"
                    title={`Add ${tool}`}
                    onClick={() =>
                      setEditorTool(value =>
                        value === tool ? null : tool
                      )
                    }
                    style={{
                      height: '32px',
                      padding: 0,
                      borderRadius: '5px',
                      border: `1px solid ${
                        editorTool === tool
                          ? theme.accent
                          : theme.border
                      }`,
                      backgroundColor:
                        editorTool === tool
                          ? theme.accent
                          : '#BCCCBC',
                      color:
                        tool[0] === 'w'
                          ? '#FFFFFF'
                          : '#000000',
                      fontSize: '22px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {symbol}
                  </button>
                ))}
              </div>

              <button
                type="button"
                title="Remove piece"
                onClick={() =>
                  setEditorTool(value =>
                    value === 'trash' ? null : 'trash'
                  )
                }
                style={{
                  width: '32px',
                  height: '32px',
                  flexShrink: 0,
                  padding: 0,
                  borderRadius: '5px',
                  border: `1px solid ${
                    editorTool === 'trash'
                      ? '#c85c5c'
                      : theme.border
                  }`,
                  backgroundColor:
                    editorTool === 'trash'
                      ? '#c85c5c'
                      : theme.panel,
                  color: '#fff',
                  fontSize: '15px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                🗑
              </button>
            </div>
          )}

          {isEditMode && (
            <div
              style={{
                marginTop: '6px',
                fontSize: '10px',
                color: '#777',
                textAlign: 'center'
              }}
            >
              {editorTool === 'trash'
                ? 'Remove mode: click a piece on the board.'
                : editorTool
                  ? 'Click a square to place the selected piece.'
                  : 'Select a piece above or below the board, or drag existing pieces.'}
            </div>
          )}
        </div>

        {/* ====================================================
            TOOLBAR
        ==================================================== */}

        <div
          style={{
            width:
              '100%',
            marginTop:
              '24px',
            display:
              'flex',
            gap:
              '8px',
            height:
              '38px'
          }}
        >

          {/* TURN TOGGLE */}

          <button
            type="button"
            title={
              isBlackToMove
                ? 'Black to move — click to switch to White'
                : 'White to move — click to switch to Black'
            }
            aria-label={
              isBlackToMove
                ? 'Black to move'
                : 'White to move'
            }
            onClick={() =>
              handleTurnChange(
                isBlackToMove ? 'w' : 'b'
              )
            }
            style={{
              position: 'relative',
              width: '58px',
              height: '32px',
              padding: '3px',
              boxSizing: 'border-box',
              border: `1px solid ${
                isBlackToMove
                  ? '#555'
                  : '#aaa'
              }`,
              borderRadius: '18px',
              backgroundColor: isBlackToMove
                ? '#111'
                : '#d7d7d7',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isBlackToMove
                ? 'flex-end'
                : 'flex-start',
              transition: 'all 0.2s ease',
              boxShadow:
                'inset 0 1px 3px rgba(0,0,0,0.35)',
              outline: 'none'
            }}
          >
            <span
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: isBlackToMove
                  ? '#292929'
                  : '#ffffff',
                border: `1px solid ${
                  isBlackToMove
                    ? '#666'
                    : '#c0c0c0'
                }`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                lineHeight: 1,
                color: isBlackToMove
                  ? '#fff'
                  : '#222',
                boxShadow:
                  '0 1px 3px rgba(0,0,0,0.4)',
                transition: 'all 0.2s ease'
              }}
            >
              {isBlackToMove ? '♟' : '♙'}
            </span>
          </button>


          <div
            style={{
              flex:
                1
            }}
          />


          {/* STOCKFISH TOGGLE */}

          <button
            type="button"
            title={
              stockfishEnabled
                ? 'Disable Stockfish evaluation'
                : 'Enable Stockfish evaluation'
            }
            aria-label="Toggle Stockfish evaluation"
            onClick={() =>
              setStockfishEnabled(
                value => !value
              )
            }
            style={{
              width: '42px',
              height: '32px',
              padding: 0,
              backgroundColor:
                stockfishEnabled
                  ? theme.accent
                  : theme.bg,
              border:
                `1px solid ${
                  stockfishEnabled
                    ? theme.accent
                    : theme.border
                }`,
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color:
                stockfishEnabled
                  ? '#fff'
                  : '#888',
              outline: 'none',
              transition:
                'all 0.2s ease'
            }}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 4h10" />
              <path d="M8 4v4c0 1.8 1.1 3.2 2.7 4-1.6.8-2.7 2.2-2.7 4v4" />
              <path d="M16 4v4c0 1.8-1.1 3.2-2.7 4 1.6.8 2.7 2.2 2.7 4v4" />
              <path d="M7 20h10" />
              <path d="M12 8v8" />
            </svg>
          </button>


          {/* EDIT MODE */}

          <button
            title={
              isEditMode
                ? 'Exit Edit Mode'
                : 'Enable Edit Mode'
            }
            onClick={() => {
              /*
               * ENTER EDIT MODE
               */
              if (!isEditMode) {
                setEditError('')
                setEditorTool(null)
                setIsEditMode(true)
                return
              }

              /*
               * SAVE / EXIT EDIT MODE
               *
               * First build a complete FEN and then ask chess.js
               * to validate the edited position. If chess.js rejects
               * it, remain in Edit Mode and show a friendly message.
               */
              const raw =
                String(fen || '')
                  .trim()
                  .split(/\s+/)

              const parts = [
                raw[0] || '8/8/8/8/8/8/8/8',
                'w',
                '-',
                '-',
                '0',
                raw[5] || '1'
              ]

              const editedFen =
                parts.join(' ')

              try {
                /*
                 * Normal chess.js construction performs FEN validation.
                 * This intentionally does NOT use skipValidation here.
                 */
                const validatedGame =
                  new Chess(editedFen)

                /*
                 * If the position contains check, the side whose king
                 * is in check must be the side to move. A position where
                 * White is in check but Black is set to move is therefore
                 * rejected, and vice versa.
                 */
                const whiteKingInCheck =
                  validatedGame.isAttacked(
                    validatedGame.board()
                      .flat()
                      .find(
                        square =>
                          square &&
                          square.type === 'k' &&
                          square.color === 'w'
                      )?.square || 'e1',
                    'b'
                  )

                const blackKingInCheck =
                  validatedGame.isAttacked(
                    validatedGame.board()
                      .flat()
                      .find(
                        square =>
                          square &&
                          square.type === 'k' &&
                          square.color === 'b'
                      )?.square || 'e8',
                    'w'
                  )

                const sideToMove =
                  editedFen.split(/\s+/)[1]

                if (
                  whiteKingInCheck &&
                  sideToMove !== 'w'
                ) {
                  throw new Error(
                    'Invalid FEN: move number must be a positive integer.'
                  )
                }

                if (
                  blackKingInCheck &&
                  sideToMove !== 'b'
                ) {
                  throw new Error(
                    'Invalid FEN: move number must be a positive integer.'
                  )
                }

                setFen(editedFen)
                setEditError('')
                setEditorTool(null)
                setIsEditMode(false)

              } catch (error) {
                console.warn(
                  'Cannot save edited position:',
                  error
                )

                const board =
                  fenToGrid(editedFen)

                const whiteKings =
                  board
                    ? board.flat().filter(piece => piece === 'K').length
                    : 0

                const blackKings =
                  board
                    ? board.flat().filter(piece => piece === 'k').length
                    : 0

                const whitePawnsOnBackRank =
                  board
                    ? board[0].filter(piece => piece === 'P').length +
                      board[7].filter(piece => piece === 'P').length
                    : 0

                const blackPawnsOnBackRank =
                  board
                    ? board[0].filter(piece => piece === 'p').length +
                      board[7].filter(piece => piece === 'p').length
                    : 0

                let message =
                  'Cannot save position.'

                if (whiteKings === 0 && blackKings === 0) {
                  message =
                    'Both kings are missing. Add exactly one White King and one Black King.'
                } else if (whiteKings === 0) {
                  message =
                    'White King is missing. Add exactly one White King before saving.'
                } else if (blackKings === 0) {
                  message =
                    'Black King is missing. Add exactly one Black King before saving.'
                } else if (whiteKings > 1 && blackKings > 1) {
                  message =
                    `Too many kings: ${whiteKings} White Kings and ${blackKings} Black Kings. Keep exactly one of each.`
                } else if (whiteKings > 1) {
                  message =
                    `Too many White Kings (${whiteKings}). Keep exactly one White King.`
                } else if (blackKings > 1) {
                  message =
                    `Too many Black Kings (${blackKings}). Keep exactly one Black King.`
                } else if (
                  whitePawnsOnBackRank > 0 &&
                  blackPawnsOnBackRank > 0
                ) {
                  message =
                    'White and Black pawns cannot be on the first or eighth rank.'
                } else if (whitePawnsOnBackRank > 0) {
                  message =
                    'White pawn on the first or eighth rank. Move or remove it before saving.'
                } else if (blackPawnsOnBackRank > 0) {
                  message =
                    'Black pawn on the first or eighth rank. Move or remove it before saving.'
                } else if (
                  error &&
                  typeof error.message === 'string'
                ) {
                  message =
                    error.message
                }

                setEditError(message)
              }
            }}
            style={{
              width:
                '42px',
              backgroundColor:
                isEditMode
                  ? theme.accent
                  : theme.bg,
              border:
                `1px solid ${
                  isEditMode
                    ? theme.accent
                    : theme.border
                }`,
              borderRadius:
                '6px',
              cursor:
                'pointer',
              display:
                'flex',
              justifyContent:
                'center',
              alignItems:
                'center',
              color:
                isEditMode
                  ? '#111'
                  : '#888'
            }}
          >

            {isEditMode ? (

              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline
                  points="20 6 9 17 4 12"
                />
              </svg>

            ) : (

              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>

            )}

          </button>


          {/* RESET */}

          <button
            title="Reset Board"
            onClick={handleResetBoard}
            style={{
              width: '42px',
              backgroundColor: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              color: '#888'
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <polyline points="3 4 3 10 9 10" />
            </svg>
          </button>


          {/* FLIP */}

          <button
            title="Flip Board"
            onClick={() =>
              setOrientation(
                value =>
                  value === 'white'
                    ? 'black'
                    : 'white'
              )
            }
            style={{
              width:
                '42px',
              backgroundColor:
                theme.bg,
              border:
                `1px solid ${theme.border}`,
              borderRadius:
                '6px',
              cursor:
                'pointer',
              display:
                'flex',
              justifyContent:
                'center',
              alignItems:
                'center',
              color:
                '#888'
            }}
          >

            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21 16-4 4-4-4" />
              <path d="M17 20V4" />
              <path d="m3 8 4-4 4 4" />
              <path d="M7 4v16" />
            </svg>

          </button>

        </div>


        {/* ====================================================
            FEN
        ==================================================== */}

        <div
          style={{
            marginTop:
              '24px',
            width:
              '100%'
          }}
        >

          <label
            style={{
              fontSize:
                '13px',
              color:
                '#888',
              fontWeight:
                '600',
              textTransform:
                'uppercase',
              letterSpacing:
                '1px'
            }}
          >
            FEN String
          </label>


          <div
            style={{
              position:
                'relative',
              marginTop:
                '8px'
            }}
          >

            <textarea
              value={
                fen
              }
              onChange={event =>
                setFen(
                  event.target.value
                )
              }
              rows={3}
              style={{
                width:
                  '100%',
                padding:
                  '12px',
                paddingRight:
                  '44px',
                fontSize:
                  '13px',
                borderRadius:
                  '6px',
                border:
                  `1px solid ${
                    isEditMode
                      ? theme.accent
                      : theme.border
                  }`,
                backgroundColor:
                  theme.bg,
                color:
                  theme.accent,
                fontFamily:
                  'monospace',
                boxSizing:
                  'border-box',
                resize:
                  'vertical'
              }}
            />


            <button
              onClick={
                handleCopyFen
              }
              title={
                copied
                  ? 'Copied!'
                  : 'Copy FEN'
              }
              style={{
                position:
                  'absolute',
                top:
                  '8px',
                right:
                  '8px',
                background:
                  theme.panel,
                border:
                  `1px solid ${theme.border}`,
                color:
                  copied
                    ? theme.accent
                    : '#888',
                borderRadius:
                  '4px',
                cursor:
                  'pointer',
                padding:
                  '6px',
                display:
                  'flex',
                justifyContent:
                  'center',
                alignItems:
                  'center'
              }}
            >

              {copied ? (

                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline
                    points="20 6 9 17 4 12"
                  />
                </svg>

              ) : (

                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect
                    x="9"
                    y="9"
                    width="13"
                    height="13"
                    rx="2"
                  />

                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />

                </svg>

              )}

            </button>

          </div>

        </div>

      </div>

    </div>
  )
}

export default App
