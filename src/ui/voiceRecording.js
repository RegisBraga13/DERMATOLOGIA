import { countDistinctSpeakers, formatDiarizedTranscript, preferredRecordingMimeType, requestConsultationTranscription, showMicrophonePermissionHelp } from "../services/voiceService.js";

// Gravacao da consulta inteira, tirada do App.js.
//
// O bloco e coeso: ele e o unico dono do gravador, do stream, dos pedacos de
// audio e do cronometro — seis variaveis que nao interessam a mais ninguem e
// que estavam soltas no topo do App.js, junto do estado clinico. O que o resto
// do programa precisa saber e so uma coisa: se ha gravacao ou transcricao em
// andamento, para nao deixar trocar de pagina no meio.
//
// Recebe as dependencias em vez de importa-las porque elas sao o estado vivo do
// App.js — o rascunho da consulta, o formulario na tela. Passar por parametro
// deixa a fronteira explicita: e esta lista, e nada alem dela.
export function createVoiceRecording({ app, getDraft, updateDraftFromForm, defaultConsultation, processAnamnesisTranscriptSilently, defaultReturn, processReturnTranscriptSilently }) {
  let recorder = null;
  let stream = null;
  let chunks = [];
  let startedAt = 0;
  let durationTimer = null;
  let activeButton = null;
  let transcribing = false;

  function setVoiceStatus(button, message, state = "") {
    const status = button?.closest(".voice-controls")?.querySelector(".voice-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }

  function updateRecordingDuration(button) {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
    const seconds = String(elapsedSeconds % 60).padStart(2, "0");
    setVoiceStatus(button, `Gravando toda a conversa · ${minutes}:${seconds} · clique novamente para encerrar`, "listening");
  }

  function cleanup() {
    clearInterval(durationTimer);
    durationTimer = null;
    stream?.getTracks().forEach(track => track.stop());
    recorder = null;
    stream = null;
    chunks = [];
    startedAt = 0;
    activeButton = null;
  }

  async function requestMicrophonePermission(button) {
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceStatus(button, "Acesso ao microfone indisponível", "error");
      alert("Este navegador não permite acesso ao microfone. Use Chrome, Edge ou Safari atualizado.");
      return null;
    }

    setVoiceStatus(button, "Solicitando acesso ao microfone…", "requesting");
    button.classList.add("is-requesting");

    try {
      // A verificacao de permissao deve usar a constraint mais compativel.
      // Safari pode rejeitar propriedades avancadas com "Invalid constraint".
      const granted = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      button.classList.remove("is-requesting");
      setVoiceStatus(button, "Microfone autorizado. Iniciando a gravação…", "done");
      return granted;
    } catch (error) {
      button.classList.remove("is-requesting");
      if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
        setVoiceStatus(button, "Microfone bloqueado — clique no cadeado da barra de endereço", "error");
        showMicrophonePermissionHelp();
      } else if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
        setVoiceStatus(button, "Nenhum microfone foi encontrado", "error");
        alert("Conecte ou ative um microfone e tente novamente.");
      } else {
        setVoiceStatus(button, "Não foi possível acessar o microfone", "error");
        alert(`Falha ao acessar o microfone${error?.message ? `: ${error.message}` : "."}`);
      }
      return null;
    }
  }

  async function startVoice(targetName, button) {
    if (recorder?.state === "recording") {
      setVoiceStatus(activeButton, "Encerrando a gravação e enviando para transcrição…", "requesting");
      recorder.stop();
      return;
    }

    const fieldElement = app.querySelector(`[name='${targetName}']`);
    if (!fieldElement) return;

    if (!window.isSecureContext) {
      setVoiceStatus(button, "O microfone exige uma conexão segura", "error");
      return alert("Abra o sistema por http://127.0.0.1:8000 ou por HTTPS para permitir o uso do microfone.");
    }

    if (!window.MediaRecorder) {
      setVoiceStatus(button, "Gravação de áudio indisponível neste navegador", "error");
      return alert("Este navegador não oferece gravação integral de áudio. Use Chrome, Edge ou Safari atualizado.");
    }

    try {
      const granted = await requestMicrophonePermission(button);
      if (!granted) return;
      const mimeType = preferredRecordingMimeType();
      const recorderOptions = { audioBitsPerSecond: 32000 };
      if (mimeType) recorderOptions.mimeType = mimeType;
      const activeRecorder = new MediaRecorder(granted, recorderOptions);
      recorder = activeRecorder;
      stream = granted;
      chunks = [];
      startedAt = Date.now();
      activeButton = button;

      activeRecorder.addEventListener("dataavailable", event => {
        if (event.data?.size) chunks.push(event.data);
      });
      activeRecorder.addEventListener("start", () => {
        button.classList.remove("is-requesting");
        button.classList.add("is-listening");
        button.setAttribute("aria-label", "Encerrar gravação da conversa");
        button.title = "Encerrar gravação";
        updateRecordingDuration(button);
        durationTimer = setInterval(() => updateRecordingDuration(button), 1000);
      });
      activeRecorder.addEventListener("error", event => {
        cleanup();
        setVoiceStatus(button, event.error?.message || "Falha durante a gravação", "error");
      });
      activeRecorder.addEventListener("stop", async () => {
        clearInterval(durationTimer);
        durationTimer = null;
        stream?.getTracks().forEach(track => track.stop());
        const recorded = chunks;
        const recordedType = activeRecorder.mimeType || mimeType || "audio/webm";
        recorder = null;
        stream = null;
        chunks = [];
        startedAt = 0;
        button.classList.remove("is-listening", "is-requesting");
        button.setAttribute("aria-label", "Iniciar gravação da conversa");
        button.title = "Iniciar gravação";

        const audio = new Blob(recorded, { type: recordedType });
        if (!audio.size) {
          activeButton = null;
          setVoiceStatus(button, "A gravação ficou vazia", "error");
          return;
        }
        transcribing = true;
        setVoiceStatus(button, "Transcrevendo toda a conversa e identificando os falantes…", "requesting");
        try {
          const transcription = await requestConsultationTranscription(audio);
          const transcript = formatDiarizedTranscript(transcription.segments);
          fieldElement.value = transcript;
          updateDraftFromForm(fieldElement.closest("form"));
          const draft = getDraft();
          // "relatoRetorno" e a mesma gravacao da conversa inteira, so que na
          // tela do retorno: mesmo fluxo de permissao/blob/transcricao, o que
          // muda e o rascunho que recebe o texto e quem processa em seguida.
          const isReturnField = targetName === "relatoRetorno";
          const target = isReturnField ? (draft.return || defaultReturn()) : (draft.consultation || defaultConsultation());
          target[targetName] = transcript;
          target.transcriptionSegments = transcription.segments;
          target.transcriptionDuration = transcription.duration;
          target.transcribedAt = new Date().toISOString();
          if (isReturnField) {
            draft.return = target;
          } else {
            target.anamnesisInputMode = "microphone";
            target.anamnesisDoctorTextOverrides = { ...(target.anamnesisDoctorTextOverrides || {}), qphda: false };
            // Pista determinística para o card de acompanhante: nunca um
            // palpite de identidade, so a contagem de vozes distintas.
            target.multipleSpeakersDetected = countDistinctSpeakers(transcription.segments) > 2;
            draft.consultation = target;
          }
          setVoiceStatus(button, isReturnField ? "Transcrição concluída. Analisando a evolução com a literatura…" : "Transcrição concluída. Analisando a anamnese com a literatura…", "requesting");
          if (isReturnField) await processReturnTranscriptSilently(transcript, { preserveFocus: false });
          else await processAnamnesisTranscriptSilently(transcript, { preserveFocus: false });
          setVoiceStatus(app.querySelector(`[data-action='voice'][data-target='${targetName}']`), "Conversa transcrita e campos atualizados. Revise antes de salvar.", "done");
        } catch (error) {
          setVoiceStatus(button, error.message || "Não foi possível transcrever a conversa", "error");
          alert(error.message || "Não foi possível transcrever a conversa.");
        } finally {
          transcribing = false;
          activeButton = null;
        }
      });
      activeRecorder.start(5000);
    } catch (error) {
      cleanup();
      setVoiceStatus(button, error?.message || "Não foi possível iniciar a gravação", "error");
    }
  }

  // A pergunta que o resto do App.js faz: da para sair desta pagina agora?
  return {
    startVoice,
    cleanup,
    isBusy: () => recorder?.state === "recording" || transcribing
  };
}
