import { useEffect, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { pdfjs, Document, Page } from 'react-pdf'
import { Chess } from 'chess.js'

const CHESS_COM_ICON = '/icons/chess-com-pawn.png'
const LICHESS_ICON = '/icons/lichess.svg'


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

  /* FEN fullmove number must always be a positive integer. */
  const currentMoveNumber =
    Number.parseInt(parts[5], 10)

  parts[5] =
    Number.isInteger(currentMoveNumber) && currentMoveNumber > 0
      ? String(currentMoveNumber)
      : '1'

  return parts.join(' ')
}

/* ============================================================
   LOADER
   ============================================================ */

function KnightLoader() {
  return (
    <div
      className="chessscanner-loader-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '14px',
        backgroundColor: theme.panel,
        padding: '26px 36px',
        borderRadius: '12px',
        boxShadow: theme.boardShadow,
        width: 'min(320px, calc(100vw - 40px))',
        boxSizing: 'border-box'
      }}
    >
      <style>
        {`
          @keyframes knightJump {
            0%, 100% {
              transform: translateY(0) scale(1);
            }

            50% {
              transform: translateY(-14px) scale(1.08);
            }
          }

          @keyframes chessProgress {
            0% {
              transform: translateX(-130%);
            }

            100% {
              transform: translateX(300%);
            }
          }

          .chessscanner-loader-knight {
            font-size: 52px;
            color: ${theme.accent};
            animation: knightJump 0.8s infinite ease-in-out;
            display: inline-block;
            line-height: 1;
          }

          .chessscanner-loader-text {
            color: ${theme.title};
            font-weight: bold;
            font-size: 16px;
            text-align: center;
          }

          .chessscanner-progress-track {
            width: 100%;
            height: 5px;
            border-radius: 999px;
            overflow: hidden;
            background: ${theme.border};
          }

          .chessscanner-progress-bar {
            width: 35%;
            height: 100%;
            border-radius: 999px;
            background: ${theme.accent};
            animation: chessProgress 1.3s infinite ease-in-out;
          }

          @media (max-width: 768px) {
            .chessscanner-loader-card {
              width: min(280px, calc(100vw - 32px)) !important;
              padding: 22px 26px !important;
              gap: 12px !important;
              border-radius: 10px !important;
            }

            .chessscanner-loader-knight {
              font-size: 44px !important;
            }

            .chessscanner-loader-text {
              font-size: 14px !important;
            }

            .chessscanner-progress-track {
              height: 4px !important;
            }
          }

          @media (max-width: 380px) {
            .chessscanner-loader-card {
              width: calc(100vw - 24px) !important;
              padding: 20px 22px !important;
            }

            .chessscanner-loader-knight {
              font-size: 40px !important;
            }
          }
        `}
      </style>

      <div className="chessscanner-loader-knight">
        ♞
      </div>

      <div className="chessscanner-loader-text">
        Analyzing Position...
      </div>

      <div className="chessscanner-progress-track">
        <div className="chessscanner-progress-bar" />
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

  /*
   * Position history for Previous / Next navigation.
   * The board itself remains controlled exclusively by `fen`.
   */
  const historyRef = useRef({
    positions: [INITIAL_FEN],
    index: 0
  })

  const [, setHistoryVersion] =
    useState(0)

  const historyNavigationRef =
    useRef(false)

  useEffect(() => {
    if (historyNavigationRef.current) {
      historyNavigationRef.current = false
      setHistoryVersion(value => value + 1)
      return
    }

    const history = historyRef.current
    const current = history.positions[history.index]

    if (current === fen) {
      return
    }

    /* A new position after going backward creates a new branch. */
    history.positions =
      history.positions.slice(0, history.index + 1)
    history.positions.push(fen)
    history.index = history.positions.length - 1
    setHistoryVersion(value => value + 1)
  }, [fen])

  function handlePreviousPosition() {
    const history = historyRef.current

    if (history.index <= 0) {
      return
    }

    history.index -= 1
    historyNavigationRef.current = true
    setSelectedSquare(null)
    setLastMove(null)
    setFen(history.positions[history.index])
    setHistoryVersion(value => value + 1)
  }

  function handleNextPosition() {
    const history = historyRef.current

    if (history.index >= history.positions.length - 1) {
      return
    }

    history.index += 1
    historyNavigationRef.current = true
    setSelectedSquare(null)
    setLastMove(null)
    setFen(history.positions[history.index])
    setHistoryVersion(value => value + 1)
  }

  const canGoPrevious =
    historyRef.current.index > 0

  const canGoNext =
    historyRef.current.index <
    historyRef.current.positions.length - 1

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

  /* Play-mode click/tap selection. Edit Mode does not use this. */
  const [selectedSquare, setSelectedSquare] =
    useState(null)

  /*
   * Last legal move played in Play Mode.
   * Used to highlight both the source and destination squares.
   */
  const [lastMove, setLastMove] =
    useState(null)

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

  const stockfishWorkerRef =
    useRef(null)

  const stockfishRequestRef =
    useRef(0)


  const isBlackToMove =
    fen.trim().split(/\s+/)[1] === 'b'

  useEffect(() => {
    setSelectedSquare(null)
  }, [fen])


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

    setSelectedSquare(null)
    setLastMove(null)

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

    setLastMove({
      from: sourceSquare,
      to: targetSquare
    })
    setSelectedSquare(null)
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

      setSelectedSquare(null)
      setLastMove(null)
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

    const parts = fen.trim().split(/\s+/)

    while (parts.length < 6) {
      parts.push('-')
    }

    parts[0] = gridToFen(grid)

    /* Any position changed in Edit Mode defaults to White to move. */
    parts[1] = 'w'

    parts[2] = '-'
    parts[3] = '-'
    parts[4] = '0'

    const currentMoveNumber =
      Number.parseInt(parts[5], 10)

    parts[5] =
      Number.isInteger(currentMoveNumber) && currentMoveNumber > 0
        ? String(currentMoveNumber)
        : '1'

    setSelectedSquare(null)
    setLastMove(null)
    setFen(parts.join(' '))

    /*
     * A board change means the user is correcting the position,
     * so remove the previous validation message.
     */
    setEditError('')
  }

  function handleSquareClick({ square }) {
    if (!square) return

    /* --------------------------------------------------------
       EDIT MODE
       -------------------------------------------------------- */
    if (isEditMode) {
      if (editorTool === 'trash') {
        updateEditSquare(square, null)
        return
      }

      const pieceChar = pieceFromTool(editorTool)

      if (pieceChar) {
        updateEditSquare(square, pieceChar)
      }

      return
    }

    /* --------------------------------------------------------
       PLAY MODE: click/tap-to-move
       -------------------------------------------------------- */
    try {
      const game = new Chess(fen, {
        skipValidation: true
      })

      const selected = selectedSquare

      if (selected) {
        const legalMoves = game.moves({
          square: selected,
          verbose: true
        })

        const destination = legalMoves.find(
          move => move.to === square
        )

        if (destination) {
          makeLegalMove(selected, square)
          return
        }
      }

      const piece = game.get(square)

      if (piece && piece.color === game.turn()) {
        setSelectedSquare(
          selected === square ? null : square
        )
      } else {
        setSelectedSquare(null)
      }
    } catch (error) {
      console.warn('Square selection error:', error)
      setSelectedSquare(null)
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
              'https://chessscanner-backend.onrender.com/extract-click',
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
            const scannedFen =
              data.fen.trim()

            /*
             * A fresh scan starts a fresh position history.
             */
            historyRef.current = {
              positions: [scannedFen],
              index: 0
            }
            setHistoryVersion(value => value + 1)
            setSelectedSquare(null)
            setLastMove(null)
            setFen(scannedFen)

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
        worker.postMessage('isready')
        return
      }

      if (line === 'readyok') {
        stockfishReadyRef.current =
          true

        if (!isEditMode) {
          analyseCurrentPosition(
            worker
          )
        }

        return
      }

      if (
        isEditMode ||
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

      /*
       * Stockfish score is relative to the side to move.
       * Convert it to White's point of view.
       */
      const mateMatch =
        line.match(
          /score mate (-?\d+)/
        )

      if (mateMatch) {
        const mate =
          Number(mateMatch[1])

        setStockfishEval({
          type: 'mate',
          value:
            sideToMove === 'b'
              ? -mate
              : mate
        })

        return
      }

      const cpMatch =
        line.match(
          /score cp (-?\d+)/
        )

      if (cpMatch) {
        const cp =
          Number(cpMatch[1])

        const whiteCp =
          sideToMove === 'b'
            ? -cp
            : cp

        setStockfishEval({
          type: 'cp',
          value:
            whiteCp / 100
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

  const selectedMoveStyles = {}

  if (!isEditMode) {
    /* --------------------------------------------------------
       LAST MOVE HIGHLIGHT
       -------------------------------------------------------- */
    if (lastMove) {
      const lastMoveStyle = {
        backgroundColor:
          'rgba(255, 193, 7, 0.28)',
        boxShadow:
          'inset 0 0 0 3px rgba(255, 193, 7, 0.78)'
      }

      selectedMoveStyles[lastMove.from] = {
        ...lastMoveStyle
      }

      selectedMoveStyles[lastMove.to] = {
        ...lastMoveStyle
      }
    }

    /* --------------------------------------------------------
       SELECTED PIECE + LEGAL DESTINATIONS
       -------------------------------------------------------- */
    if (selectedSquare) {
      try {
        const game = new Chess(fen, {
          skipValidation: true
        })

        const selectedMoves = game.moves({
          square: selectedSquare,
          verbose: true
        })

        /* Strong border around the selected piece. */
        selectedMoveStyles[selectedSquare] = {
          ...selectedMoveStyles[selectedSquare],
          boxShadow:
            'inset 0 0 0 4px rgba(255, 214, 70, 0.95)',
          backgroundColor:
            'rgba(255, 214, 70, 0.30)'
        }

        selectedMoves.forEach(move => {
          const isCapture =
            Boolean(move.captured) ||
            move.flags.includes('e')

          selectedMoveStyles[move.to] = {
            ...selectedMoveStyles[move.to],
            backgroundColor: isCapture
              ? 'rgba(220, 80, 70, 0.34)'
              : 'rgba(255, 214, 70, 0.22)',
            boxShadow: isCapture
              ? 'inset 0 0 0 4px rgba(220, 80, 70, 0.82)'
              : 'inset 0 0 0 4px rgba(255, 214, 70, 0.82)'
          }
        })
      } catch {
        /* Ignore invalid temporary positions. */
      }
    }
  }

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

    squareStyles:
      selectedMoveStyles,

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
    historyRef.current = {
      positions: [INITIAL_FEN],
      index: 0
    }
    setSelectedSquare(null)
    setLastMove(null)
    setFen(INITIAL_FEN)
    setHistoryVersion(value => value + 1)
    setIsEditMode(false)
    setEditorTool(null)
    setEditError('')
  }


  /* ==========================================================
     EXTERNAL ANALYSIS
     ========================================================== */

  function getAnalysisFen() {
    /*
     * External analysis sites expect a complete FEN. Use the current
     * board FEN, and make sure the side-to-move and move number are
     * present even for positions produced by scanning.
     */
    const raw =
      String(fen || '')
        .trim()
        .split(/\s+/)

    const parts = [
      raw[0] || '8/8/8/8/8/8/8/8',
      raw[1] === 'b' ? 'b' : 'w',
      raw[2] || '-',
      raw[3] || '-',
      /^\d+$/.test(raw[4] || '')
        ? raw[4]
        : '0',
      /^\d+$/.test(raw[5] || '')
        ? Math.max(1, Number(raw[5]))
        : '1'
    ]

    return parts.join(' ')
  }


  function openLichessAnalysis() {
    const analysisFen =
      getAnalysisFen()

    /*
     * Lichess supports a FEN directly in its analysis-board URL,
     * with spaces encoded as underscores.
     */
    const encodedFen =
      analysisFen.replace(/ /g, '_')

    const url =
      `https://lichess.org/analysis/${encodedFen}`

    window.open(
      url,
      '_blank',
      'noopener,noreferrer'
    )
  }


  function openChessComAnalysis() {
    const analysisFen =
      getAnalysisFen()

    /*
     * Chess.com accepts FEN through its Analysis board/editor.
     * Encode the complete FEN so slashes, spaces and other FEN
     * characters are safely preserved in the URL.
     */
    const url =
      `https://www.chess.com/analysis?fen=${encodeURIComponent(analysisFen)}`

    window.open(
      url,
      '_blank',
      'noopener,noreferrer'
    )
  }


  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <div
      className="chessscanner-app"
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
      <style>{`
        .chessscanner-app {
          box-sizing: border-box;
          min-height: 100vh;
        }

        .chessscanner-pdf-panel,
        .chessscanner-chess-panel {
          box-sizing: border-box;
          min-width: 0;
        }

        .chessscanner-pdf-scroll {
          -webkit-overflow-scrolling: touch;
        }

        .chessscanner-pdf-page {
          box-sizing: border-box;
        }

        @media (max-width: 768px) {
          .chessscanner-app {
            display: flex !important;
            flex-direction: column !important;
            width: 100% !important;
            min-height: 100dvh !important;
            height: auto !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
          }

          .chessscanner-pdf-panel {
            flex: 0 0 auto !important;
            width: 100% !important;
            height: auto !important;
            border-right: none !important;
            border-bottom: 1px solid rgba(128,128,128,.25);
            overflow: hidden !important;
          }

          .chessscanner-pdf-header {
            padding: 12px 14px !important;
          }

          .chessscanner-pdf-header h1 {
            font-size: 18px !important;
            gap: 7px !important;
          }

          .chessscanner-pdf-header h1 span {
            font-size: 24px !important;
          }

          .chessscanner-pdf-scroll {
            flex: none !important;
            height: auto !important;
            max-height: 58dvh !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
          }

          .chessscanner-pdf-content {
            padding: 16px 8px !important;
            width: 100%;
            box-sizing: border-box;
          }

          .chessscanner-pdf-page {
            width: 100% !important;
            max-width: 100% !important;
            margin-bottom: 18px !important;
            overflow: hidden;
          }

          .chessscanner-pdf-page .react-pdf__Page {
            width: 100% !important;
            max-width: 100% !important;
          }

          .chessscanner-pdf-page canvas {
            width: 100% !important;
            height: auto !important;
            max-width: 100% !important;
          }

          .chessscanner-chess-panel {
            flex: 0 0 auto !important;
            width: 100% !important;
            padding: 18px 12px 30px !important;
            overflow-x: hidden !important;
            overflow-y: visible !important;
          }

          .chessscanner-board-row {
            width: 100% !important;
          }

          .chessscanner-toolbar {
            margin-top: 16px !important;
            gap: 7px !important;
            height: 42px !important;
          }

          .chessscanner-toolbar button {
            min-width: 42px !important;
            width: 42px !important;
            height: 40px !important;
            min-height: 40px !important;
            flex-shrink: 0 !important;
            touch-action: manipulation;
          }

          .chessscanner-fen {
            margin-top: 18px !important;
          }

          .chessscanner-fen textarea {
            font-size: 12px !important;
            min-height: 80px;
          }

          .chessscanner-board-row,
          .chessscanner-board-row * {
            touch-action: manipulation;
          }

          .chessscanner-upload {
            min-height: 40px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }
        }

        @media (max-width: 380px) {
          .chessscanner-chess-panel {
            padding-left: 8px !important;
            padding-right: 8px !important;
          }

          .chessscanner-toolbar {
            gap: 5px !important;
          }

          .chessscanner-toolbar button {
            min-width: 39px !important;
            width: 39px !important;
          }
        }
      `}</style>

      {/* ======================================================
          PDF PANEL
          ====================================================== */}

      <div
        className="chessscanner-pdf-panel"
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
          className="chessscanner-pdf-header"
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
            className="chessscanner-upload"
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
          className="chessscanner-pdf-scroll"
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
                  0,
                bottom:
                  0,
                width:
                  '100vw',
                height:
                  '100vh',
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
            className="chessscanner-pdf-content"
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
                      className="chessscanner-pdf-page"
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
        className="chessscanner-chess-panel"
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
                      ['bP', '\u265F']
                    ]
                  : [
                      ['wK', '♔'],
                      ['wQ', '♕'],
                      ['wR', '♖'],
                      ['wB', '♗'],
                      ['wN', '♘'],
                      ['wP', '\u2659']
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
            className="chessscanner-board-row"
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
                key={`scan-${scanVersion}-${selectedSquare || 'none'}-${lastMove?.from || 'none'}-${lastMove?.to || 'none'}`}
                options={chessboardOptions}
              />
            </div>
          </div>

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
                      ['wP', '\u2659']
                    ]
                  : [
                      ['bK', '♚'],
                      ['bQ', '♛'],
                      ['bR', '♜'],
                      ['bB', '♝'],
                      ['bN', '♞'],
                      ['bP', '\u265F']
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
          className="chessscanner-toolbar"
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

          {/* PREVIOUS POSITION */}

          <button
            type="button"
            title="Previous position"
            aria-label="Previous position"
            onClick={handlePreviousPosition}
            disabled={!canGoPrevious}
            style={{
              width: '38px',
              height: '32px',
              flexShrink: 0,
              padding: 0,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              backgroundColor: canGoPrevious
                ? theme.bg
                : '#1d1c1a',
              color: canGoPrevious
                ? theme.title
                : '#555',
              cursor: canGoPrevious
                ? 'pointer'
                : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              lineHeight: 1
            }}
          >
            ←
          </button>

          {/* NEXT POSITION */}

          <button
            type="button"
            title="Next position"
            aria-label="Next position"
            onClick={handleNextPosition}
            disabled={!canGoNext}
            style={{
              width: '38px',
              height: '32px',
              flexShrink: 0,
              padding: 0,
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              backgroundColor: canGoNext
                ? theme.bg
                : '#1d1c1a',
              color: canGoNext
                ? theme.title
                : '#555',
              cursor: canGoNext
                ? 'pointer'
                : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              lineHeight: 1
            }}
          >
            →
          </button>

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
              {isBlackToMove ? '\u265F' : '\u2659'}
            </span>
          </button>


          <div
            style={{
              flex:
                1
            }}
          />


          {/* CHESS.COM ANALYSIS */}

          <button
            type="button"
            title="Analyze on Chess.com"
            aria-label="Analyze position on Chess.com"
            onClick={openChessComAnalysis}
            disabled={isEditMode}
            style={{
              width: '42px',
              height: '32px',
              padding: 0,
              backgroundColor:
                isEditMode
                  ? theme.bg
                  : theme.panel,
              border:
                `1px solid ${
                  isEditMode
                    ? theme.border
                    : '#657383'
                }`,
              borderRadius: '6px',
              cursor:
                isEditMode
                  ? 'not-allowed'
                  : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity:
                isEditMode ? 0.4 : 1,
              transition:
                'all 0.18s ease'
            }}
          >
            <img
              src={CHESS_COM_ICON}
              alt=""
              draggable="false"
              style={{
                width: '17px',
                height: '22px',
                objectFit: 'contain',
                filter:
                  isEditMode
                    ? 'grayscale(1)'
                    : 'none'
              }}
            />
          </button>


          {/* LICHESS ANALYSIS */}

          <button
            type="button"
            title="Analyze on Lichess"
            aria-label="Analyze position on Lichess"
            onClick={openLichessAnalysis}
            disabled={isEditMode}
            style={{
              width: '42px',
              height: '32px',
              padding: 0,
              backgroundColor:
                isEditMode
                  ? theme.bg
                  : theme.panel,
              border:
                `1px solid ${
                  isEditMode
                    ? theme.border
                    : '#657383'
                }`,
              borderRadius: '6px',
              cursor:
                isEditMode
                  ? 'not-allowed'
                  : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity:
                isEditMode ? 0.4 : 1,
              transition:
                'all 0.18s ease'
            }}
          >
            <img
              src={LICHESS_ICON}
              alt=""
              draggable="false"
              style={{
                width: '21px',
                height: '21px',
                objectFit: 'contain',
                filter:
                  'brightness(0) invert(1)',
                opacity:
                  isEditMode ? 0.4 : 1
              }}
            />
          </button>


          {/* STOCKFISH TOGGLE */}

          <button
            type="button"
            title={
              stockfishEnabled
                ? 'Disable Stockfish engine'
                : 'Enable Stockfish engine'
            }
            aria-label="Toggle Stockfish engine"
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
                    : '#a99555'
                }`,
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color:
                stockfishEnabled
                  ? '#fff'
                  : '#d2bd6a',
              outline: 'none',
              transition:
                'all 0.18s ease'
            }}
          >
            {/* Professional chess-engine / CPU icon */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <rect
                x="6"
                y="6"
                width="12"
                height="12"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="
                  M9 3v3
                  M12 3v3
                  M15 3v3
                  M9 18v3
                  M12 18v3
                  M15 18v3
                  M3 9h3
                  M3 12h3
                  M3 15h3
                  M18 9h3
                  M18 12h3
                  M18 15h3
                "
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
              <path
                d="M9.5 10.2h5M12 10.2v3.6M9.5 13.8h5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="9.5"
                cy="10.2"
                r="1"
                fill="currentColor"
              />
              <circle
                cx="14.5"
                cy="10.2"
                r="1"
                fill="currentColor"
              />
              <circle
                cx="12"
                cy="13.8"
                r="1"
                fill="currentColor"
              />
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

              const parsedMoveNumber =
                Number.parseInt(raw[5], 10)

              const safeMoveNumber =
                Number.isInteger(parsedMoveNumber) && parsedMoveNumber > 0
                  ? parsedMoveNumber
                  : 1

              const parts = [
                raw[0] || '8/8/8/8/8/8/8/8',
                'w',
                '-',
                '-',
                '0',
                String(safeMoveNumber)
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

                setSelectedSquare(null)
                setLastMove(null)
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
          className="chessscanner-fen"
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
              onChange={event => {
                setSelectedSquare(null)
                setLastMove(null)
                setFen(event.target.value)
              }}
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

