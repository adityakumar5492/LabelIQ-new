import {
  AlertCircle,
  ArrowRight,
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  CloudUpload,
  FileImage,
  ImagePlus,
  Info,
  Loader2,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  Zap,
} from "lucide-react";

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../api/axios";


// ============================================================
// CONSTANTS
// ============================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];


// ============================================================
// PROCESSING STEPS
// ============================================================

const processingSteps = [
  {
    id: 1,
    title: "Uploading image",
    description: "Securely sending your food label",
  },
  {
    id: 2,
    title: "Reading the label",
    description: "Extracting visible text with OCR",
  },
  {
    id: 3,
    title: "Analyzing ingredients",
    description: "Checking ingredients and nutrition",
  },
  {
    id: 4,
    title: "Generating insights",
    description: "Applying LabelIQ health intelligence",
  },
];


// ============================================================
// COMPONENT
// ============================================================

export default function ScanPage() {
  const navigate = useNavigate();

  const fileInputRef = useRef(null);

  // Live camera references
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [activeTab, setActiveTab] = useState("upload");

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");

  const [dragActive, setDragActive] = useState(false);

  const [isScanning, setIsScanning] = useState(false);

  const [processingStep, setProcessingStep] = useState(0);

  const [error, setError] = useState("");

  const [scanStarted, setScanStarted] = useState(false);

  // Camera states
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);


  // ==========================================================
  // CLEANUP CAMERA WHEN COMPONENT IS REMOVED
  // ==========================================================

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });

        streamRef.current = null;
      }
    };
  }, []);


  // ==========================================================
  // STOP CAMERA WHEN LEAVING CAMERA TAB
  // ==========================================================

  useEffect(() => {
    if (activeTab !== "camera") {
      stopCamera();
    }
  }, [activeTab]);


  // ==========================================================
  // CLEAN PREVIEW URL
  // ==========================================================

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);


  // ==========================================================
  // FILE VALIDATION
  // ==========================================================

  const validateFile = (file) => {
    if (!file) {
      return "Please select a food label image.";
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return "Please choose a JPG, PNG, or WebP image.";
    }

    if (file.size > MAX_FILE_SIZE) {
      return "This image is too large. Please choose an image smaller than 10 MB.";
    }

    return "";
  };


  // ==========================================================
  // SELECT FILE
  // ==========================================================

  const selectFile = (file) => {
    setError("");

    const validationError = validateFile(file);

    if (validationError) {
      setError(validationError);
      return;
    }

    // Stop camera if a file is selected
    stopCamera();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const url = URL.createObjectURL(file);

    setSelectedFile(file);
    setPreviewUrl(url);
    setScanStarted(false);
  };


  // ==========================================================
  // FILE INPUT
  // ==========================================================

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    if (file) {
      selectFile(file);
    }

    // Allows selecting the same file again
    event.target.value = "";
  };


  // ==========================================================
  // DRAG EVENTS
  // ==========================================================

  const handleDragEnter = (event) => {
    event.preventDefault();
    event.stopPropagation();

    setDragActive(true);
  };


  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();

    setDragActive(false);
  };


  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!dragActive) {
      setDragActive(true);
    }
  };


  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();

    setDragActive(false);

    const file = event.dataTransfer.files?.[0];

    if (file) {
      selectFile(file);
    }
  };


  // ==========================================================
  // REMOVE IMAGE
  // ==========================================================

  const removeImage = () => {
    stopCamera();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(null);
    setPreviewUrl("");
    setError("");
    setScanStarted(false);
  };


  // ==========================================================
  // CAMERA
  // ==========================================================

  const startCamera = async () => {
    setError("");
    setCameraLoading(true);

    try {
      // Browser does not support camera API
      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        throw new Error(
          "Your browser does not support live camera access."
        );
      }


      // Stop any existing camera first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });

        streamRef.current = null;
      }


      // Request rear camera first
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },

            width: {
              ideal: 1280,
            },

            height: {
              ideal: 720,
            },
          },

          audio: false,
        });


      streamRef.current = stream;

      setCameraActive(true);


      // Attach camera stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        try {
          await videoRef.current.play();
        } catch (playError) {
          console.warn(
            "Camera video autoplay was blocked:",
            playError
          );
        }
      }

    } catch (cameraError) {

      console.error(
        "Camera access failed:",
        cameraError
      );


      if (
        cameraError?.name === "NotAllowedError" ||
        cameraError?.name === "PermissionDeniedError"
      ) {
        setError(
          "Camera permission was denied. Please allow camera access in your browser settings and try again."
        );

      } else if (
        cameraError?.name === "NotFoundError" ||
        cameraError?.name === "DevicesNotFoundError"
      ) {
        setError(
          "No camera was found on this device. You can upload a food label image instead."
        );

      } else if (
        cameraError?.name === "NotReadableError" ||
        cameraError?.name === "TrackStartError"
      ) {
        setError(
          "Your camera is currently being used by another application. Please close that application and try again."
        );

      } else if (
        cameraError?.name === "OverconstrainedError"
      ) {
        setError(
          "The requested camera is not available. Please try again or upload an image instead."
        );

      } else {
        setError(
          "We could not open your camera. Please check your browser permissions or upload an image instead."
        );
      }

      setCameraActive(false);

    } finally {
      setCameraLoading(false);
    }
  };


  // ==========================================================
  // STOP CAMERA
  // ==========================================================

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });

      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
    setCameraLoading(false);
  };


  // ==========================================================
  // CAPTURE PHOTO FROM LIVE CAMERA
  // ==========================================================

  const capturePhoto = () => {
    const video = videoRef.current;

    if (!video) {
      setError(
        "The camera is not ready yet. Please wait a moment and try again."
      );

      return;
    }


    if (
      !video.videoWidth ||
      !video.videoHeight
    ) {
      setError(
        "The camera is still starting. Please wait a moment and try again."
      );

      return;
    }


    try {
      const canvas = document.createElement("canvas");

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;


      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error(
          "Could not prepare the camera image."
        );
      }


      // Draw current camera frame
      context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );


      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setError(
              "We could not capture the photo. Please try again."
            );

            return;
          }


          const file = new File(
            [blob],
            `labeliq-camera-${Date.now()}.jpg`,
            {
              type: "image/jpeg",
            }
          );


          // Convert camera frame into normal image file
          selectFile(file);

          // Stop live camera after capture
          stopCamera();

        },
        "image/jpeg",
        0.92
      );

    } catch (captureError) {

      console.error(
        "Photo capture failed:",
        captureError
      );

      setError(
        "We could not capture the photo. Please try again."
      );
    }
  };


  // ==========================================================
  // RETAKE CAMERA PHOTO
  // ==========================================================

  const retakePhoto = async () => {
    removeImage();

    setActiveTab("camera");

    // Give React a moment to render the camera section
    setTimeout(() => {
      startCamera();
    }, 100);
  };


  // ==========================================================
  // FORMAT FILE SIZE
  // ==========================================================

  const formatFileSize = (bytes) => {
    if (!bytes) {
      return "0 KB";
    }

    const mb = bytes / (1024 * 1024);

    if (mb >= 1) {
      return `${mb.toFixed(1)} MB`;
    }

    return `${Math.round(bytes / 1024)} KB`;
  };


  // ==========================================================
  // EXTRACT SCAN ID
  // ==========================================================

  const extractScanId = (response) => {
    return (
      response?.data?.data?.database?.scanId ??
      response?.data?.database?.scanId ??
      response?.data?.data?.scanId ??
      response?.data?.scanId ??
      response?.data?.data?.analysis?.id ??
      response?.data?.analysis?.id ??
      null
    );
  };


  // ==========================================================
  // START SCAN
  // ==========================================================

  const handleScan = async () => {
    if (!selectedFile) {
      setError(
        "Please upload or capture a food label image first."
      );

      return;
    }


    setError("");
    setIsScanning(true);
    setScanStarted(true);
    setProcessingStep(0);


    try {
      const formData = new FormData();


      /*
       * The Node scan route receives the uploaded image.
       * Keep the frontend request isolated here so the API
       * contract can be changed in one place if required.
       */
      formData.append(
        "image",
        selectedFile
      );


      // --------------------------------------------------------
      // STEP 1
      // --------------------------------------------------------

      setProcessingStep(0);

      await new Promise((resolve) =>
        setTimeout(resolve, 500)
      );


      // --------------------------------------------------------
      // STEP 2
      // --------------------------------------------------------

      setProcessingStep(1);


      const responsePromise = api.post(
        "/scan",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },

          maxContentLength: Infinity,

          maxBodyLength: Infinity,

          timeout: 120000,
        }
      );


      await new Promise((resolve) =>
        setTimeout(resolve, 700)
      );


      setProcessingStep(2);


      // --------------------------------------------------------
      // WAIT FOR BACKEND
      // --------------------------------------------------------

      const response = await responsePromise;


      // --------------------------------------------------------
      // STEP 3
      // --------------------------------------------------------

      setProcessingStep(3);


      await new Promise((resolve) =>
        setTimeout(resolve, 500)
      );


      // --------------------------------------------------------
      // GET SCAN ID
      // --------------------------------------------------------

      const scanId = extractScanId(response);


      if (!scanId) {

        console.warn(
          "Scan completed but no scan ID was returned:",
          response.data
        );


        throw new Error(
          "Scan completed, but the result ID was not returned by the server."
        );
      }


      // --------------------------------------------------------
      // GO TO RESULT
      // --------------------------------------------------------

      navigate(`/scan/${scanId}`);

    } catch (requestError) {

      console.error(
        "Food scan failed:",
        requestError
      );


      const serverMessage =
        requestError?.response?.data?.detail ||
        requestError?.response?.data?.message ||
        requestError?.response?.data?.error;


      if (
        requestError?.code === "ECONNABORTED"
      ) {

        setError(
          "The scan is taking longer than expected. Please try again."
        );

      } else if (
        requestError?.response?.status === 401
      ) {

        setError(
          "Your session has expired. Please log in again."
        );

      } else if (
        requestError?.response?.status === 413
      ) {

        setError(
          "The image is too large. Please choose a smaller image."
        );

      } else if (serverMessage) {

        setError(serverMessage);

      } else {

        setError(
          "We could not analyze this image. Please check the image and try again."
        );
      }

    } finally {

      setIsScanning(false);

      setProcessingStep(0);
    }
  };


  // ==========================================================
  // RETRY
  // ==========================================================

  const handleRetry = () => {
    setError("");
    setScanStarted(false);

    if (selectedFile) {
      handleScan();
    }
  };


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="min-h-[calc(100vh-76px)] bg-[#06110e]">

      {/* ======================================================
          BACKGROUND
      ====================================================== */}

      <div className="pointer-events-none fixed inset-0 overflow-hidden">

        <div className="absolute left-[15%] top-[5%] h-[320px] w-[320px] rounded-full bg-emerald-400/[0.025] blur-[110px]" />

        <div className="absolute right-[-5%] top-[30%] h-[400px] w-[400px] rounded-full bg-cyan-400/[0.02] blur-[130px]" />

        <div
          className="absolute inset-0 opacity-[0.018]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

      </div>


      {/* ======================================================
          PAGE
      ====================================================== */}

      <div className="relative mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 xl:px-10">


        {/* ====================================================
            HEADER
        ==================================================== */}

        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">

          <div>

            <div className="mb-1.5 flex items-center gap-2">

              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />

              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-400">
                Food Intelligence
              </p>

            </div>


            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Scan Food Label
            </h1>


            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 sm:text-sm">
              Upload a food label or use your camera. LabelIQ will
              read the label, check the ingredients and nutrition,
              and provide personalized insights.
            </p>

          </div>


          <div className="hidden items-center gap-2 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.035] px-3 py-2 sm:flex">

            <ShieldCheck
              size={14}
              className="text-emerald-400"
            />

            <span className="text-[10px] font-medium text-slate-500">
              Evidence-backed analysis
            </span>

          </div>

        </div>


        {/* ====================================================
            TABS
        ==================================================== */}

        <div className="mb-4 flex w-fit rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">

          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`
              flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition
              ${
                activeTab === "upload"
                  ? "bg-emerald-400 text-[#03100c] shadow-sm"
                  : "text-slate-500 hover:text-white"
              }
            `}
          >
            <Upload size={14} />
            Upload Image
          </button>


          <button
            type="button"
            onClick={() => setActiveTab("camera")}
            className={`
              flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition
              ${
                activeTab === "camera"
                  ? "bg-emerald-400 text-[#03100c] shadow-sm"
                  : "text-slate-500 hover:text-white"
              }
            `}
          >
            <Camera size={14} />
            Use Camera
          </button>

        </div>


        {/* ====================================================
            MAIN GRID
        ==================================================== */}

        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">


          {/* ==================================================
              MAIN PANEL
          ================================================== */}

          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-6">


            {/* =================================================
                UPLOAD TAB
            ================================================= */}

            {activeTab === "upload" && (

              <div>

                {!selectedFile ? (

                  <div
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() =>
                      fileInputRef.current?.click()
                    }
                    className={`
                      group relative flex min-h-[380px]
                      cursor-pointer flex-col items-center
                      justify-center overflow-hidden rounded-2xl
                      border border-dashed p-6 text-center
                      transition-all duration-300
                      ${
                        dragActive
                          ? "border-emerald-400 bg-emerald-400/[0.07]"
                          : "border-white/[0.10] bg-black/[0.08] hover:border-emerald-400/30 hover:bg-emerald-400/[0.025]"
                      }
                    `}
                  >

                    <div className="pointer-events-none absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/[0.04] blur-[70px] transition group-hover:bg-emerald-400/[0.07]" />


                    <div className="relative">

                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-400 transition duration-300 group-hover:scale-105 group-hover:border-emerald-400/25">

                        {dragActive ? (
                          <CloudUpload size={27} />
                        ) : (
                          <ImagePlus size={27} />
                        )}

                      </div>


                      <h2 className="mt-5 text-base font-bold text-white">
                        {dragActive
                          ? "Drop your label here"
                          : "Upload your food label"}
                      </h2>


                      <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">
                        Choose a clear photo of the ingredient list
                        or nutrition facts. You can also drag and
                        drop an image here.
                      </p>


                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();

                          fileInputRef.current?.click();
                        }}
                        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-xs font-bold text-[#03100c] transition hover:bg-emerald-300"
                      >
                        <Upload size={14} />
                        Choose Image
                      </button>


                      <p className="mt-4 text-[9px] text-slate-700">
                        JPG, PNG or WebP • Maximum 10 MB
                      </p>

                    </div>


                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                  </div>

                ) : (

                  /* =================================================
                     IMAGE PREVIEW
                  ================================================= */

                  <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-black/[0.12]">

                    <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">

                      <div className="flex items-center gap-2">

                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
                          <FileImage size={15} />
                        </div>

                        <div>

                          <p className="max-w-[220px] truncate text-xs font-semibold text-white">
                            {selectedFile.name}
                          </p>

                          <p className="text-[9px] text-slate-700">
                            {formatFileSize(selectedFile.size)}
                          </p>

                        </div>

                      </div>


                      {!isScanning && (

                        <button
                          type="button"
                          onClick={removeImage}
                          aria-label="Remove image"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-rose-400/[0.07] hover:text-rose-400"
                        >
                          <X size={15} />
                        </button>

                      )}

                    </div>


                    <div className="relative flex min-h-[350px] items-center justify-center bg-black/20 p-4 sm:min-h-[420px]">

                      <img
                        src={previewUrl}
                        alt="Selected food label"
                        className="max-h-[420px] max-w-full rounded-xl object-contain shadow-2xl"
                      />

                    </div>

                  </div>

                )}


                {/* =================================================
                    ERROR
                ================================================= */}

                {error && (

                  <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-400/10 bg-rose-400/[0.05] p-3">

                    <AlertCircle
                      size={16}
                      className="mt-0.5 shrink-0 text-rose-400"
                    />

                    <div className="flex-1">

                      <p className="text-xs font-semibold text-rose-300">
                        Something went wrong
                      </p>

                      <p className="mt-1 text-[10px] leading-4 text-rose-400/70">
                        {error}
                      </p>

                    </div>


                    {selectedFile && !isScanning && (

                      <button
                        type="button"
                        onClick={handleRetry}
                        className="flex items-center gap-1 rounded-lg border border-rose-400/10 px-2.5 py-1.5 text-[9px] font-semibold text-rose-300 hover:bg-rose-400/[0.06]"
                      >
                        <RotateCcw size={11} />
                        Retry
                      </button>

                    )}

                  </div>

                )}


                {/* =================================================
                    SCAN BUTTON
                ================================================= */}

                {selectedFile && !isScanning && (

                  <button
                    type="button"
                    onClick={handleScan}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-xs font-bold text-[#03100c] shadow-[0_10px_30px_rgba(52,211,153,0.08)] transition hover:bg-emerald-300"
                  >
                    <ScanLine size={16} />

                    Analyze Food Label

                    <ArrowRight size={14} />
                  </button>

                )}

              </div>

            )}


            {/* ==================================================
                CAMERA TAB
            ================================================== */}

            {activeTab === "camera" && (

              <div>

                {/* ----------------------------------------------
                    CAPTURED IMAGE
                ---------------------------------------------- */}

                {selectedFile ? (

                  <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-black/[0.12]">

                    <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">

                      <div className="flex items-center gap-2">

                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-400">
                          <Camera size={15} />
                        </div>

                        <div>

                          <p className="text-xs font-semibold text-white">
                            Photo captured
                          </p>

                          <p className="text-[9px] text-slate-600">
                            Review the image before analyzing it
                          </p>

                        </div>

                      </div>


                      <button
                        type="button"
                        onClick={removeImage}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-rose-400/[0.07] hover:text-rose-400"
                        aria-label="Remove captured photo"
                      >
                        <X size={15} />
                      </button>

                    </div>


                    <div className="relative flex min-h-[350px] items-center justify-center bg-black/20 p-4 sm:min-h-[420px]">

                      <img
                        src={previewUrl}
                        alt="Captured food label"
                        className="max-h-[420px] max-w-full rounded-xl object-contain shadow-2xl"
                      />

                    </div>


                    {!isScanning && (

                      <div className="grid gap-2 border-t border-white/[0.06] p-3 sm:grid-cols-2">

                        <button
                          type="button"
                          onClick={retakePhoto}
                          className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-xs font-semibold text-slate-300 transition hover:border-cyan-400/20 hover:bg-cyan-400/[0.04] hover:text-white"
                        >
                          <RotateCcw size={14} />
                          Retake Photo
                        </button>


                        <button
                          type="button"
                          onClick={handleScan}
                          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-xs font-bold text-[#03100c] transition hover:bg-emerald-300"
                        >
                          <ScanLine size={15} />
                          Analyze Food Label
                          <ArrowRight size={13} />
                        </button>

                      </div>

                    )}

                  </div>

                ) : (

                  /* ----------------------------------------------
                     LIVE CAMERA
                  ---------------------------------------------- */

                  <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/[0.12]">

                    {cameraActive ? (

                      <div>

                        {/* Camera viewport */}

                        <div className="relative overflow-hidden bg-black">

                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="block aspect-video w-full object-cover"
                          />


                          {/* Dark overlay */}

                          <div className="pointer-events-none absolute inset-0 bg-black/[0.12]" />


                          {/* Scan frame */}

                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">

                            <div className="relative aspect-[4/3] w-full max-w-[560px] rounded-2xl border border-white/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]">

                              {/* Top left */}

                              <div className="absolute left-[-1px] top-[-1px] h-7 w-7 border-l-2 border-t-2 border-emerald-400" />

                              {/* Top right */}

                              <div className="absolute right-[-1px] top-[-1px] h-7 w-7 border-r-2 border-t-2 border-emerald-400" />

                              {/* Bottom left */}

                              <div className="absolute bottom-[-1px] left-[-1px] h-7 w-7 border-b-2 border-l-2 border-emerald-400" />

                              {/* Bottom right */}

                              <div className="absolute bottom-[-1px] right-[-1px] h-7 w-7 border-b-2 border-r-2 border-emerald-400" />


                              {/* Scan line */}

                              <div className="absolute left-3 right-3 top-1/2 h-px bg-emerald-400/70 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />

                            </div>

                          </div>


                          {/* Camera instruction */}

                          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 backdrop-blur-md">

                            <p className="whitespace-nowrap text-[9px] font-medium text-white">
                              Keep the label inside the frame
                            </p>

                          </div>

                        </div>


                        {/* Camera controls */}

                        <div className="border-t border-white/[0.06] bg-[#081510] p-4">

                          <div className="flex flex-col items-center gap-3">

                            <p className="text-center text-[10px] leading-4 text-slate-600">
                              Make sure the ingredient list or nutrition
                              facts are clearly visible before taking the photo.
                            </p>


                            <button
                              type="button"
                              onClick={capturePhoto}
                              className="group flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-3 text-xs font-bold text-[#03100c] shadow-[0_8px_30px_rgba(52,211,153,0.12)] transition hover:bg-emerald-300"
                            >

                              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#03100c]/30">

                                <Camera size={14} />

                              </span>

                              Capture Photo

                            </button>


                            <button
                              type="button"
                              onClick={stopCamera}
                              className="flex items-center gap-1.5 text-[9px] font-medium text-slate-600 transition hover:text-white"
                            >
                              <CameraOff size={12} />
                              Close Camera
                            </button>

                          </div>

                        </div>

                      </div>

                    ) : (

                      /* ------------------------------------------
                         CAMERA NOT STARTED
                      ------------------------------------------ */

                      <div className="flex min-h-[420px] flex-col items-center justify-center p-6 text-center">

                        <div className="relative">

                          <div className="absolute inset-0 rounded-2xl bg-cyan-400/[0.08] blur-2xl" />

                          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.06] text-cyan-400">

                            {cameraLoading ? (
                              <Loader2
                                size={27}
                                className="animate-spin"
                              />
                            ) : (
                              <Camera size={27} />
                            )}

                          </div>

                        </div>


                        <h2 className="mt-5 text-base font-bold text-white">

                          {cameraLoading
                            ? "Opening your camera..."
                            : "Take a photo of your food label"}

                        </h2>


                        <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">

                          {cameraLoading
                            ? "Please allow camera access if your browser asks for permission."
                            : "Your camera will open directly on this page. Point it at the ingredient list or nutrition facts and capture a clear photo."}

                        </p>


                        {!cameraLoading && (

                          <button
                            type="button"
                            onClick={startCamera}
                            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-xs font-bold text-[#03100c] transition hover:bg-emerald-300"
                          >
                            <Camera size={15} />
                            Open Camera
                          </button>

                        )}


                        <div className="mt-6 max-w-sm rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">

                          <div className="flex items-start gap-2.5 text-left">

                            <Info
                              size={13}
                              className="mt-0.5 shrink-0 text-cyan-400"
                            />

                            <p className="text-[9px] leading-4 text-slate-600">
                              LabelIQ only needs camera access to take
                              the photo. Your camera is not used for
                              continuous recording.
                            </p>

                          </div>

                        </div>

                      </div>

                    )}

                  </div>

                )}


                {/* =================================================
                    CAMERA ERROR
                ================================================= */}

                {error && (

                  <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-400/10 bg-rose-400/[0.05] p-3">

                    <AlertCircle
                      size={16}
                      className="mt-0.5 shrink-0 text-rose-400"
                    />

                    <div className="flex-1">

                      <p className="text-xs font-semibold text-rose-300">
                        Camera could not be opened
                      </p>

                      <p className="mt-1 text-[10px] leading-4 text-rose-400/70">
                        {error}
                      </p>

                    </div>

                  </div>

                )}


                {/* =================================================
                    CAPTURED IMAGE SCAN BUTTON
                ================================================= */}

                {selectedFile && !isScanning && (

                  <button
                    type="button"
                    onClick={handleScan}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-xs font-bold text-[#03100c] shadow-[0_10px_30px_rgba(52,211,153,0.08)] transition hover:bg-emerald-300"
                  >
                    <ScanLine size={16} />
                    Analyze Food Label
                    <ArrowRight size={14} />
                  </button>

                )}

              </div>

            )}

          </section>


          {/* ==================================================
              RIGHT INFORMATION PANEL
          ================================================== */}

          <div className="space-y-4">


            {/* =================================================
                HOW IT WORKS
            ================================================= */}

            <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">

              <div className="mb-5 flex items-center gap-3">

                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
                  <Sparkles size={16} />
                </div>

                <div>

                  <h2 className="text-sm font-bold text-white">
                    How LabelIQ works
                  </h2>

                  <p className="mt-0.5 text-[9px] text-slate-600">
                    From your photo to personalized insight
                  </p>

                </div>

              </div>


              <div className="space-y-4">

                {processingSteps.map((step, index) => {

                  const completed =
                    scanStarted &&
                    processingStep > index;

                  const active =
                    scanStarted &&
                    processingStep === index;


                  return (

                    <div
                      key={step.id}
                      className="flex gap-3"
                    >

                      <div className="relative">

                        <div
                          className={`
                            flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[10px] font-bold transition
                            ${
                              completed
                                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-400"
                                : active
                                  ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-400"
                                  : "border-white/[0.07] bg-white/[0.025] text-slate-600"
                            }
                          `}
                        >

                          {completed ? (
                            <Check size={14} />
                          ) : active ? (
                            <Loader2
                              size={14}
                              className="animate-spin"
                            />
                          ) : (
                            step.id
                          )}

                        </div>


                        {index <
                          processingSteps.length - 1 && (

                          <div className="absolute left-1/2 top-8 h-5 w-px -translate-x-1/2 bg-white/[0.06]" />

                        )}

                      </div>


                      <div className="pt-0.5">

                        <p
                          className={`text-[11px] font-semibold ${
                            active || completed
                              ? "text-white"
                              : "text-slate-500"
                          }`}
                        >
                          {step.title}
                        </p>

                        <p className="mt-0.5 text-[9px] leading-4 text-slate-700">
                          {step.description}
                        </p>

                      </div>

                    </div>

                  );

                })}

              </div>

            </section>


            {/* =================================================
                TIPS
            ================================================= */}

            <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">

              <div className="mb-4 flex items-center gap-3">

                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400">
                  <Info size={16} />
                </div>

                <div>

                  <h2 className="text-sm font-bold text-white">
                    Tips for a better scan
                  </h2>

                  <p className="mt-0.5 text-[9px] text-slate-600">
                    A clear photo gives you better results
                  </p>

                </div>

              </div>


              <div className="space-y-2">

                {[
                  "Use good lighting so the text is easy to read.",
                  "Capture the complete nutrition facts panel.",
                  "Keep your phone straight instead of tilting it.",
                  "Make sure the ingredient list is clearly visible.",
                ].map((tip) => (

                  <div
                    key={tip}
                    className="flex items-start gap-2.5 rounded-xl border border-white/[0.04] bg-white/[0.015] p-2.5"
                  >

                    <CheckCircle2
                      size={13}
                      className="mt-0.5 shrink-0 text-emerald-400/70"
                    />

                    <p className="text-[10px] leading-4 text-slate-500">
                      {tip}
                    </p>

                  </div>

                ))}

              </div>

            </section>


            {/* =================================================
                TRUST CARD
            ================================================= */}

            <section className="relative overflow-hidden rounded-2xl border border-emerald-400/10 bg-gradient-to-br from-emerald-400/[0.06] to-transparent p-4 sm:p-5">

              <div className="absolute right-[-20px] top-[-20px] h-24 w-24 rounded-full bg-emerald-400/[0.05] blur-2xl" />


              <div className="relative flex gap-3">

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
                  <ShieldCheck size={16} />
                </div>


                <div>

                  <p className="text-xs font-bold text-white">
                    Built for explainable analysis
                  </p>

                  <p className="mt-1 text-[9px] leading-4 text-slate-600">
                    LabelIQ combines OCR, nutrition data, health
                    rules, evidence retrieval and AI-generated
                    explanations to help you understand a product.
                  </p>

                </div>

              </div>

            </section>

          </div>

        </div>


        {/* ====================================================
            BOTTOM TRUST STRIP
        ==================================================== */}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">

          <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">

            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
              <ScanLine size={14} />
            </div>

            <div>

              <p className="text-[10px] font-semibold text-white">
                OCR Extraction
              </p>

              <p className="text-[8px] text-slate-700">
                Read visible label information
              </p>

            </div>

          </div>


          <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">

            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-400">
              <Zap size={14} />
            </div>

            <div>

              <p className="text-[10px] font-semibold text-white">
                Intelligent Analysis
              </p>

              <p className="text-[8px] text-slate-700">
                Ingredients + nutrition + rules
              </p>

            </div>

          </div>


          <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">

            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-400/10 text-violet-400">
              <Sparkles size={14} />
            </div>

            <div>

              <p className="text-[10px] font-semibold text-white">
                Personalized Insights
              </p>

              <p className="text-[8px] text-slate-700">
                Based on your health profile
              </p>

            </div>

          </div>

        </div>


        {/* ====================================================
            FOOTER
        ==================================================== */}

        <div className="flex flex-col gap-2 border-t border-white/[0.05] py-5 text-[9px] text-slate-700 sm:flex-row sm:items-center sm:justify-between">

          <div className="flex items-center gap-2">

            <ShieldCheck
              size={11}
              className="text-emerald-500/60"
            />

            <span>
              Your uploaded image is processed securely.
            </span>

          </div>


          <span>
            JPG • PNG • WebP • Max 10 MB
          </span>

        </div>

      </div>


      {/* ======================================================
          FULL SCREEN SCANNING OVERLAY
      ====================================================== */}

      {isScanning && (

        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020806]/85 px-4 backdrop-blur-md">

          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-emerald-400/10 bg-[#081510] p-6 shadow-2xl sm:p-8">

            <div className="text-center">

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-400">

                <Loader2
                  size={28}
                  className="animate-spin"
                />

              </div>


              <p className="mt-5 text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-400">
                LabelIQ Intelligence
              </p>


              <h2 className="mt-2 text-xl font-bold text-white">
                Analyzing your label
              </h2>


              <p className="mt-2 text-xs leading-5 text-slate-600">
                Please wait while LabelIQ reads your label,
                checks the ingredients and nutrition, and prepares
                your personalized results.
              </p>

            </div>


            <div className="mt-7 space-y-3">

              {processingSteps.map((step, index) => {

                const completed =
                  processingStep > index;

                const active =
                  processingStep === index;


                return (

                  <div
                    key={step.id}
                    className={`
                      flex items-center gap-3 rounded-xl border p-3 transition
                      ${
                        completed
                          ? "border-emerald-400/10 bg-emerald-400/[0.04]"
                          : active
                            ? "border-cyan-400/10 bg-cyan-400/[0.04]"
                            : "border-white/[0.04] bg-white/[0.015]"
                      }
                    `}
                  >

                    <div
                      className={`
                        flex h-7 w-7 shrink-0 items-center justify-center rounded-lg
                        ${
                          completed
                            ? "bg-emerald-400/10 text-emerald-400"
                            : active
                              ? "bg-cyan-400/10 text-cyan-400"
                              : "bg-white/[0.04] text-slate-700"
                        }
                      `}
                    >

                      {completed ? (
                        <Check size={13} />
                      ) : active ? (
                        <Loader2
                          size={13}
                          className="animate-spin"
                        />
                      ) : (
                        <span className="text-[9px] font-bold">
                          {step.id}
                        </span>
                      )}

                    </div>


                    <div className="min-w-0">

                      <p
                        className={`text-[10px] font-semibold ${
                          active || completed
                            ? "text-white"
                            : "text-slate-600"
                        }`}
                      >
                        {step.title}
                      </p>


                      <p className="mt-0.5 text-[8px] text-slate-700">
                        {step.description}
                      </p>

                    </div>

                  </div>

                );

              })}

            </div>


            <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/[0.05]">

              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                style={{
                  width: `${Math.min(
                    ((processingStep + 1) /
                      processingSteps.length) *
                      100,
                    100
                  )}%`,
                }}
              />

            </div>

          </div>

        </div>

      )}

    </div>
  );
}