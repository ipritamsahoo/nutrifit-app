/**
 * UserWorkspace.jsx
 * =====================
 * Premium Unified Workspace for both Insiders and Outsiders.
 * Features a clinical "NutriFit" theme with Dashboard, Diet Protocol, and Therapy views.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, onSnapshot, doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { 
  Stethoscope, 
  Home, 
  Utensils, 
  Activity,
  TrendingUp,
  Target,
  ChevronRight,
  X,
  AlertCircle,
  LogOut,
  Bell,
  CheckCircle2,
  Circle,
  Dumbbell,
  Trophy,
  PlayCircle,
  User,
  Info,
  ArrowLeft,
  Camera,
  Maximize2
} from 'lucide-react';
import { muscleWikiCache, prefetchMuscleWikiVideo } from '../workout-media/exerciseCache';
import VideoModal from '../workout-media/VideoModal';
import MuscleMap from '../workout-media/MuscleMap';
import CameraView from '../camera/CameraView';
import './UserWorkspace.css';

export default function UserWorkspace() {
  const { currentUser, userRole, userData, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();

  // --- EXISTING PLAN LOGIC ---
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [todayKey, setTodayKey] = useState(() => {
    const dayOfWeek = new Date().getDay();
    const dayNum = dayOfWeek === 0 ? 7 : dayOfWeek; // Sunday=7, Mon=1...
    return `day_${dayNum}`;
  });
  
  // Video Modal State
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [videoLoading, setVideoLoading] = useState(false);

  // --- NEW UI STATE ---
  const [activeTab, setActiveTab] = useState('home');
  const [isDietDetailOpen, setIsDietDetailOpen] = useState(false);
  const [workoutViewState, setWorkoutViewState] = useState('list'); // 'list', 'demo', 'live'
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [showSideBySide, setShowSideBySide] = useState(false);
  const [activeDay, setActiveDay] = useState(null); // For progress chart tooltip

  // --- CAMERA STATE ---
  const [liveRepCount, setLiveRepCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- DEMO VIDEO STATE ---
  const [demoVideoData, setDemoVideoData] = useState(null);
  const [demoVideoLoading, setDemoVideoLoading] = useState(false);
  const [demoFrontLoaded, setDemoFrontLoaded] = useState(false);
  const [demoSideLoaded, setDemoSideLoaded] = useState(false);
  const [demoFrontError, setDemoFrontError] = useState(false);
  const [demoSideError, setDemoSideError] = useState(false);
  const [dietStatus, setDietStatus] = useState([]);
  const [completedWorkouts, setCompletedWorkouts] = useState([]);
  const [dailyAnalytics, setDailyAnalytics] = useState({ calories: 0, accuracy: 0, loading: false });
  const [exerciseMetrics, setExerciseMetrics] = useState({});
  const [historicalWeeklyData, setHistoricalWeeklyData] = useState([]);

  // --- DATA MAPPING (Moved Up to avoid ReferenceErrors) ---
  // Helper: normalize a V2 meals array into a V1-compatible object
  const normalizeV2Meals = (mealsArr) => {
    if (!Array.isArray(mealsArr)) return mealsArr;
    const result = {};
    mealsArr.forEach(m => {
      if (typeof m === 'string') {
        // Format: "mealType:MealName|Calories"
        const colonIdx = m.indexOf(':');
        if (colonIdx > 0) {
          const mealType = m.slice(0, colonIdx).toLowerCase();
          const rest = m.slice(colonIdx + 1);
          const [foodName, cal] = rest.split('|');
          result[mealType] = cal ? `${foodName.trim()} (${cal.trim()} cal)` : foodName.trim();
        } else {
          result[`meal_${Object.keys(result).length + 1}`] = m;
        }
      } else if (m && typeof m === 'object') {
        const mealType = (m.meal_type || `meal_${Object.keys(result).length + 1}`).toLowerCase();
        const name = m.name || m.meal || '';
        result[mealType] = m.cal ? `${name} (${m.cal} cal)` : name;
      }
    });
    return result;
  };

  const todayDiet = useMemo(() => {
    const dj = plan?.diet_json;
    if (!dj || Object.keys(dj).length === 0) return null;
    // V2 Schema: diet_json.days.day_X (array of meal strings/objects)
    if (dj.days?.[todayKey]) return normalizeV2Meals(dj.days[todayKey]);
    // V2 Schema: diet_json.meals (default/day_1 meals array)
    if (Array.isArray(dj.meals)) return normalizeV2Meals(dj.meals);
    // V1 Schema: diet_json.day_X
    if (dj[todayKey]) return dj[todayKey];
    if (dj.plan) return dj.plan;
    if (dj.breakfast || dj.lunch || dj.dinner || dj.Breakfast || dj.Lunch || dj.Dinner) return dj;
    // V2 fallback: if days exist but not for todayKey, use first available day or meals
    if (dj.days) {
      const firstDay = Object.values(dj.days)[0];
      if (firstDay) return normalizeV2Meals(firstDay);
    }
    return null;
  }, [plan, todayKey]);

  const exercises = useMemo(() => {
    const wj = plan?.workout_json;
    if (!wj || Object.keys(wj).length === 0) return [];

    // V2 Schema: sched (day→template key map) + tpl (template definitions)
    if (wj.sched && wj.tpl) {
      const dayIndex = parseInt(todayKey.replace('day_', '')) - 1; // day_1 → 0
      const templateKey = wj.sched[dayIndex];
      if (templateKey && wj.tpl[templateKey]?.ex) {
        return wj.tpl[templateKey].ex.map(str => {
          if (typeof str !== 'string') return str; // already an object
          const parts = str.split('|');
          const name = parts[0] || str;
          const setsReps = parts[1] ? parts[1].split('x') : ['3', '10'];
          return {
            name,
            sets: setsReps[0] || 3,
            reps: setsReps[1] || 10,
            target_muscle: parts[2] || ''
          };
        });
      }
      // If template is a rest/mobility key with no exercises
      if (templateKey === 'M' || templateKey === 'R') {
        return [{ name: 'Rest & Recovery', sets: '-', reps: '-', target_muscle: 'Recovery' }];
      }
    }

    // V1 Schema fallbacks
    if (wj[todayKey]?.exercises) return wj[todayKey].exercises;
    if (wj.plan?.exercises) return wj.plan.exercises;
    if (Array.isArray(wj.exercises)) return wj.exercises;
    return [];
  }, [plan, todayKey]);

  const total7DayMeals = useMemo(() => {
    if (!plan?.diet_json) return 21; // fallback
    let total = 0;
    const dj = plan.diet_json;
    
    // V2 Schema
    if (dj.days) {
      Object.keys(dj.days).forEach(dayKey => {
         const dayMeals = normalizeV2Meals(dj.days[dayKey]);
         if (dayMeals) total += Object.keys(dayMeals).length;
      });
      return total;
    }
    // V1 Schema
    let foundDays = 0;
    for (let i = 1; i <= 7; i++) {
       if (dj[`day_${i}`]) {
         total += Object.keys(dj[`day_${i}`]).filter(k => dj[`day_${i}`][k]).length;
         foundDays++;
       }
    }
    if (foundDays > 0) return total;
    
    // Fallback if only one set of default meals is provided
    const fallbackMeals = dj.meals ? normalizeV2Meals(dj.meals) : dj;
    const baseCount = Object.keys(fallbackMeals).filter(k => fallbackMeals[k]).length || 3;
    return baseCount * 7;
  }, [plan]);

  const total7DayExercises = useMemo(() => {
    if (!plan?.workout_json) return 28; // fallback
    let total = 0;
    const wj = plan.workout_json;
    
    // V2 Schema
    if (wj.sched && wj.tpl) {
      wj.sched.forEach(templateKey => {
         if (templateKey && templateKey !== 'M' && templateKey !== 'R' && wj.tpl[templateKey]?.ex) {
           total += wj.tpl[templateKey].ex.length;
         }
      });
      if (total > 0) return total;
    }
    
    // V1 Schema
    let foundDays = 0;
    for (let i = 1; i <= 7; i++) {
       if (wj[`day_${i}`]?.exercises) {
         total += wj[`day_${i}`].exercises.length;
         foundDays++;
       }
    }
    if (foundDays > 0) return total;
    
    // Fallback
    const baseCount = Array.isArray(wj.exercises) ? wj.exercises.length : (wj.plan?.exercises?.length || 4);
    return baseCount * 7;
  }, [plan]);

  const completedDietCount = dietStatus.filter(k => k.startsWith(`${todayKey}_`)).length;
  const totalMeals = todayDiet ? Object.keys(todayDiet).filter(k => todayDiet[k]).length || 3 : 3;
  const dietProgress = Math.round((completedDietCount / totalMeals) * 100) || 0;
  
  const weeklyDietProgress = total7DayMeals > 0 ? Math.round((dietStatus.length / total7DayMeals) * 100) : 0;
  const weeklyWorkoutProgress = total7DayExercises > 0 ? Math.round((completedWorkouts.length / total7DayExercises) * 100) : 0;
  
  const todayCalories = useMemo(() => {
    let target = 0;
    let consumed = 0;

    if (!todayDiet) return { target: plan?.daily_calories_target || 1800, consumed: 0 };

    Object.entries(todayDiet).forEach(([mealName, meal]) => {
      if (!meal) return;
      let mealCals = 0;

      if (typeof meal === 'object') {
         mealCals = parseInt(meal.calories || meal.cal || 0, 10);
      } else if (typeof meal === 'string') {
         const match = meal.match(/\((\d+)\s*k?cal\)/i) || meal.match(/(\d+)\s*k?cal/i) || meal.match(/(\d+)\s*calories/i);
         if (match && match[1]) mealCals = parseInt(match[1], 10);
      }

      target += mealCals;
      
      const statusKey = mealName.toLowerCase();
      let isCompleted = dietStatus.includes(`${todayKey}_${statusKey}`);
      if (statusKey === 'snack' && dietStatus.includes(`${todayKey}_snacks`)) isCompleted = true;
      if (statusKey === 'snacks' && dietStatus.includes(`${todayKey}_snack`)) isCompleted = true;

      // Ensure that if this meal was completed via UI, it adds its actual calories
      if (isCompleted) {
        consumed += mealCals;
      }
    });

    if (target === 0) {
      target = plan?.daily_calories_target || 1800;
      consumed = Math.round((target * dietProgress) / 100);
    }

    return { target, consumed };
  }, [todayDiet, plan, dietStatus, dietProgress]);
  const activeDayCompletedCount = useMemo(() => {
    return completedWorkouts.filter(id => typeof id === 'string' && id.startsWith(`${todayKey}_`)).length;
  }, [completedWorkouts, todayKey]);

  const workoutProgress = exercises.length > 0 ? Math.round((activeDayCompletedCount / exercises.length) * 100) : 0;
  const dbAdherence = userData?.adherence || 0;
  const sessionProgress = Math.round((dietProgress + workoutProgress) / 2);
  const overallProgress = dbAdherence > 0 ? Math.round((dbAdherence + sessionProgress) / 2) : sessionProgress;

  function toggleWorkout(index, name) {
    const key = `${todayKey}_${name || index}`;
    setCompletedWorkouts(prev => 
      prev.includes(key) ? prev.filter(i => i !== key) : [...prev, key]
    );
  }

  function markWorkoutAsDone(index, name) {
    const key = `${todayKey}_${name || index}`;
    setCompletedWorkouts(prev => 
      prev.includes(key) ? prev : [...prev, key]
    );
  }

  // Calculate today's day key (Only once on mount)
  useEffect(() => {
    const dayOfWeek = new Date().getDay();
    const dayNum = dayOfWeek === 0 ? 7 : dayOfWeek;
    setTodayKey(`day_${dayNum}`);
  }, []);

  // Restore progress for the entire protocol (All 7 Days)
  useEffect(() => {
    if (currentUser) {
      const fetchProtocolHistory = async () => {
        try {
          // 1. Fetch ALL logs for this user to build the full 7-day history
          const q = query(
            collection(db, 'logs'),
            where('uid', '==', currentUser.uid)
          );
          
          const snap = await getDocs(q);
          const logsMap = {};
          const allDietStatus = new Set();
          const allCompletedWorkouts = new Set();
          
          snap.forEach(doc => {
            const data = doc.data();
            let dayKey = data.workout_day;
            
            // Inference Fallback (Same as Doctor Dashboard)
            if (!dayKey) {
              const rawString = JSON.stringify(data);
              const match = rawString.match(/day_([1-7])/);
              if (match) dayKey = `day_${match[1]}`;
            }

            if (dayKey) {
              // Track most recent log per protocol day for the chart
              if (!logsMap[dayKey] || (data.timestamp || 0) > (logsMap[dayKey].timestamp || 0)) {
                logsMap[dayKey] = data;
              }
              // Aggregate unique completed items across ALL time for this protocol
              if (Array.isArray(data.dietStatus)) {
                data.dietStatus.forEach(s => allDietStatus.add(s));
              }
              if (Array.isArray(data.completedWorkouts)) {
                data.completedWorkouts.forEach(w => allCompletedWorkouts.add(w));
              }
            }
          });

          // 2. Set the global completion states (Unions of all logs)
          setDietStatus(Array.from(allDietStatus));
          setCompletedWorkouts(Array.from(allCompletedWorkouts));

          // 3. Build the 7-Day Chart Data (Day 1 through 7)
          const weeklyData = [];
          for (let i = 1; i <= 7; i++) {
            const key = `day_${i}`;
            const history = logsMap[key];
            weeklyData.push({
              day: `Day ${i}`,
              diet: history ? (history.dietAdherence ?? history.dAdh ?? history.adherence ?? 0) : 0,
              workout: history ? (history.exerciseAdherence ?? history.eAdh ?? history.adherence ?? 0) : 0
            });
          }
          setHistoricalWeeklyData(weeklyData);
          console.debug(`[Analytics] Unified protocol history loaded (${snap.docs.length} logs).`);

        } catch (err) {
          console.error('[Analytics] Failed to fetch protocol history:', err);
        }
      };
      
      fetchProtocolHistory();
    }
  }, [currentUser]);

  // Fetch active plan
  /* ── Real-time Plan Listener ────────────────────────── */
  useEffect(() => {
    if (!currentUser) return;
    
    // Listen for the most recent plan assigned to this patient
    const q = query(
      collection(db, 'plans'),
      where('uid', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const userPlans = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort by created_at descending to get the latest plan
        userPlans.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
          const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
          return dateB - dateA;
        });
        setPlan(userPlans[0]);
      }
      setLoading(false);
    }, (err) => {
      console.error('Error listening to plans:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  /* ── DAILY PERFORMANCE ANALYTICS (Current Protocol Day Focus) ── */
  useEffect(() => {
    if (!currentUser || !todayKey) return;

    const fetchCurrentAnalytics = async () => {
      setDailyAnalytics(prev => ({ ...prev, loading: true }));
      try {
        // Query logs for the *selected* protocol day to show current feedback/angles
        const q = query(
          collection(db, 'logs'),
          where('uid', '==', currentUser.uid),
          where('workout_day', '==', todayKey)
        );

        const snap = await getDocs(q);
        let totalCals = 0;
        let totalGoodDur = 0;
        let totalAllDur = 0;
        const metricsMap = {};

        snap.forEach(doc => {
          const d = doc.data();
          const exName = (d.exercise_name || "").trim();
          
          if (d.total_calories) totalCals += d.total_calories;
          if (d.total_good_duration) totalGoodDur += d.total_good_duration;
          if (d.total_all_rep_duration) totalAllDur += d.total_all_rep_duration;

          // Per-exercise aggregation
          if (!metricsMap[exName]) {
            metricsMap[exName] = { calories: 0, goodDur: 0, allDur: 0, correctReps: 0 };
          }
          metricsMap[exName].calories += (d.total_calories || 0);
          metricsMap[exName].goodDur += (d.total_good_duration || 0);
          metricsMap[exName].allDur += (d.total_all_rep_duration || 0);
          
          const reps = d.success_reps_count !== undefined 
            ? d.success_reps_count 
            : Math.round(((d.accuracy || 0) * (d.reps_count || 0)) / 100);
          metricsMap[exName].correctReps += reps;
        });

        // Accuracy Calculation: Right Rep Time / Total Rep Time
        const accuracy = totalAllDur > 0 ? Math.round((totalGoodDur / totalAllDur) * 100) : 0;

        setDailyAnalytics({
          calories: totalCals,
          accuracy: accuracy,
          loading: false
        });

        // Finalize per-exercise accuracy
        const finalizedMetrics = {};
        Object.keys(metricsMap).forEach(name => {
          const m = metricsMap[name];
          // Strip category prefixes (e.g. "Shoulders - ") if present to match plan names
          const normalizedName = name.split(' - ').pop() || name;
          
          finalizedMetrics[normalizedName] = {
             calories: m.calories,
             accuracy: m.allDur > 0 ? Math.round((m.goodDur / m.allDur) * 100) : 0,
             correctReps: m.correctReps
          };
        });
        setExerciseMetrics(finalizedMetrics);
      } catch (err) {
        console.error('[Analytics] Error:', err);
        setDailyAnalytics(prev => ({ ...prev, loading: false }));
      }
    };
    fetchCurrentAnalytics();
  }, [currentUser, todayKey]);

  /* ── WEEKLY PROGRESS ANALYTICS ───────────────────── */
  useEffect(() => {
    if (!currentUser) return;
    const fetchWeeklyProgress = async () => {
      try {
        const q = query(
          collection(db, 'logs'),
          where('uid', '==', currentUser.uid)
        );
        
        const snap = await getDocs(q);
        const logsMap = {};
        snap.forEach(doc => {
          const data = doc.data();
          if (data.workout_day) {
            // Keep the most recent or highest adherence for that specific plan day
            if (!logsMap[data.workout_day] || data.timestamp > logsMap[data.workout_day].timestamp) {
              logsMap[data.workout_day] = data;
            }
          }
        });
        
        setHistoricalWeeklyData(Object.values(logsMap));
      } catch (err) {
        console.error('[Analytics] Error fetching weekly progress:', err);
      }
    };
    fetchWeeklyProgress();
  }, [currentUser]);

  /* ── Sync Progress to Firebase (Back to Doctor) ────── */
  useEffect(() => {
    if (!currentUser || !plan) return;

    // We only sync if there is actual progress to report
    const hasDietProgress = dietStatus.length > 0;
    const hasWorkoutProgress = completedWorkouts.length > 0;
    if (!hasDietProgress && !hasWorkoutProgress) return;

    const syncProgress = async () => {
      try {
        // 1. Calculate Adherence Metrics based on overall protocol
        const dAdh = total7DayMeals > 0 ? Math.round((dietStatus.length / total7DayMeals) * 100) : 0;
        const totalEx = total7DayExercises || 1;
        const eAdh = Math.round((completedWorkouts.length / totalEx) * 100);

        const overallAdh = Math.round((dAdh + eAdh) / 2);

        // 2. Update Patient Document (for Doctor Dashboard Table)
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          adherence: overallAdh,
          dietAdherence: dAdh,
          exerciseAdherence: eAdh,
          lastUpdated: new Date().toISOString(),
        });

        // 3. Save to Logs Collection (for Doctor Analytics/History)
        const localDateStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const logId = `${currentUser.uid}_${localDateStr}_${todayKey}`;
        const logRef = doc(db, 'logs', logId);
        await setDoc(logRef, {
          uid: currentUser.uid,
          date: localDateStr,
          timestamp: new Date().toISOString(),
          workout_day: todayKey,
          dietStatus,
          completedWorkouts,
          adherence: overallAdh,
          dietAdherence: dietProgress, // Store daily metric specifically for historical charting
          exerciseAdherence: workoutProgress, // Store daily metric specifically for historical charting
        }, { merge: true });

        console.log('[Sync] Progress saved to cloud.');
      } catch (err) {
        console.error('[Sync] Failed to save progress:', err);
      }
    };

    // Debounce sync slightly to avoid excessive writes while clicking
    const timer = setTimeout(syncProgress, 1000);
    return () => clearTimeout(timer);
  }, [dietStatus, completedWorkouts, currentUser, plan, exercises.length]);

  // Prefetch MuscleWiki media
  useEffect(() => {
    if (!plan || !plan.workout_json) return;
    const abortController = new AbortController();
    const signal = abortController.signal;

    async function runSequentalPrefetch() {
      // Resolve exercises using the same logic as resolveWorkout
      const wj = plan.workout_json;
      let exList = [];
      if (wj[todayKey]?.exercises) exList = wj[todayKey].exercises;
      else if (wj.plan?.exercises) exList = wj.plan.exercises;
      else if (Array.isArray(wj.exercises)) exList = wj.exercises;

      for (const ex of exList) {
        if (signal.aborted) return;
        if (ex.name) await prefetchMuscleWikiVideo(ex.name);
      }
    }
    runSequentalPrefetch();
    return () => abortController.abort();
  }, [plan, todayKey]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  async function handleExerciseClick(exName) {
    if (muscleWikiCache[exName]) {
      const data = muscleWikiCache[exName];
      setSelectedVideo({
        name: data.exercise_name,
        videos: data.videos,
        muscle_group: data.muscle_group,
        difficulty: data.difficulty
      });
      setVideoLoading(false);
      return;
    }

    setSelectedVideo({ name: exName, videos: null, muscle_group: null, difficulty: null });
    setVideoLoading(true);
    try {
      const res = await fetch(`/musclewiki-video?name=${encodeURIComponent(exName)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.found && data.videos) {
          muscleWikiCache[exName] = data;
          setSelectedVideo({
            name: data.exercise_name,
            videos: data.videos,
            muscle_group: data.muscle_group,
            difficulty: data.difficulty
          });
          return;
        }
      }
      setSelectedVideo(null);
      alert(`No MuscleWiki video demonstration found for "${exName}".`);
    } catch (err) {
      console.error('Error fetching video:', err);
      setSelectedVideo(null);
    } finally {
      setVideoLoading(false);
    }
  }

  // Weekly data from DB mapped to Plan Days 1-7
  const weeklyData = useMemo(() => {
    const data = [];
    for (let i = 1; i <= 7; i++) {
       const key = `day_${i}`;
       // Look up from protocol history
       const history = historicalWeeklyData[i-1];
       
       if (key === todayKey) {
          // Merge current active day's live progress
          data.push({ 
            day: `Day ${i}`, 
            diet: Math.max(dietProgress, history?.diet || 0), 
            workout: Math.max(workoutProgress, history?.workout || 0) 
          });
       } else {
          data.push({
             day: `Day ${i}`,
             diet: history?.diet || 0,
             workout: history?.workout || 0
          });
       }
    }
    return data;
  }, [historicalWeeklyData, dietProgress, workoutProgress, todayKey]);

  const sevenDayProgress = useMemo(() => {
    let sum = 0;
    weeklyData.forEach(d => {
       sum += (d.diet + d.workout) / 2;
    });
    return Math.round(sum / 7) || 0;
  }, [weeklyData]);

  // Recovery Projection Logic
  const totalRecoveryDays = 28; 
  const currentDay = 12; 
  const timeProgressX = (currentDay / totalRecoveryDays) * 100;
  const mapRecoveryY = (percentage) => 35 - (percentage / 100) * 30;
  const expectedLinePoints = `0,35 100,5`; 
  const actualLinePoints = `0,35 ${timeProgressX},${mapRecoveryY(overallProgress)}`; 

  // --- DASHBOARD VIEW ---
  const HomeView = () => (
    <div className="view-container animate-fade-in">
      <div className="profile-banner">
        <div className="profile-info-group">
          <div className="profile-avatar">
            <div className="avatar-inner">👨</div>
          </div>
          <div>
            <h2 className="user-name">{userData?.name || currentUser?.email?.split('@')[0]}</h2>
            <div className="status-badges">
              <span className="badge badge-active">
                <Activity size={14} className="mr-1" /> Active Recovery
              </span>
              <span className="badge badge-id">Patient ID: #NR-8842</span>
            </div>
          </div>
        </div>
        <div className="condition-card">
          <h3 className="card-label">
            <AlertCircle size={14} className="mr-1 text-blue" /> Primary Condition & Protocol
          </h3>
          <p className="condition-text">
            {plan?.notes || "Personalized wellness protocol for optimized health and recovery."}
          </p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="progress-circle-container">
            <svg className="progress-circle" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.915" className="circle-bg" />
              <circle cx="18" cy="18" r="15.915" className="circle-fg circle-diet" strokeDasharray={`${weeklyDietProgress} ${100 - weeklyDietProgress}`} />
            </svg>
            <span className="progress-text">{weeklyDietProgress}%</span>
          </div>
          <div className="stat-info">
            <h4 className="stat-label">Diet Completion</h4>
            <p className="stat-value">{total7DayMeals} Meals / Week</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="progress-circle-container">
            <svg className="progress-circle" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.915" className="circle-bg" />
              <circle cx="18" cy="18" r="15.915" className="circle-fg circle-workout" strokeDasharray={`${weeklyWorkoutProgress} ${100 - weeklyWorkoutProgress}`} />
            </svg>
            <span className="progress-text">{weeklyWorkoutProgress}%</span>
          </div>
          <div className="stat-info">
            <h4 className="stat-label">Therapy Progress</h4>
            <p className="stat-value">{total7DayExercises} Exercises / Week</p>
          </div>
        </div>

        <div className="stat-card trajectory-card">
           <div className="trajectory-icon"><Trophy size={80} /></div>
           <h4 className="stat-label">Overall 7-Day Progress</h4>
           <div className="trajectory-content">
             <span className="overall-percent">{sevenDayProgress}%</span>
             <span className="trend-badge">
               <TrendingUp size={14} className="mr-1" /> Avg
             </span>
           </div>
        </div>
      </div>

      <div className="analytics-section">
        <div className="analytics-header">
          <div>
            <h3 className="section-title">Progress Analytics</h3>
            <p className="section-subtitle">Daily completion trends across key protocol metrics.</p>
          </div>
          <div className="legend-group">
            <div className="legend-item"><div className="dot dot-diet"></div> Diet</div>
            <div className="legend-item"><div className="dot dot-workout"></div> Therapy</div>
          </div>
        </div>
        
        <div className="chart-wrapper">
          <div className="chart-inner">
            <div className="y-axis">
              <span className="axis-label" style={{ top: '0%' }}>100%</span>
              <span className="axis-label" style={{ top: '50%' }}>50%</span>
              <span className="axis-label" style={{ top: '100%' }}>0%</span>
            </div>

            <div className="svg-container">
              <svg className="chart-svg" viewBox="0 0 100 45" preserveAspectRatio="none" onMouseLeave={() => setActiveDay(null)}>
                <rect x="0" y="5" width="100" height="17.5" fill="#F8FAFC" />
                {weeklyData.map((_, i) => (
                  <line key={`v-${i}`} x1={5 + i * 15} y1="5" x2={5 + i * 15} y2="40" className="v-grid-line" />
                ))}
                <line x1="0" y1="5" x2="100" y2="5" className="h-grid-line" />
                <line x1="0" y1="22.5" x2="100" y2="22.5" className="h-grid-line" />
                <line x1="0" y1="40" x2="100" y2="40" className="chart-base-line" />
                {weeklyData.map((d, i) => {
                  const baseX = 5 + i * 15;
                  const dietH = (d.diet / 100) * 35;
                  const workoutH = (d.workout / 100) * 35;
                  return (
                    <g key={i}>
                      <rect x={baseX - 3.5} y={40 - dietH} width="3" height={dietH} className="bar-diet" />
                      <rect x={baseX + 0.5} y={40 - workoutH} width="3" height={workoutH} className="bar-workout" />
                      <rect x={baseX - 6} y={0} width={12} height={45} fill="transparent" onMouseEnter={() => setActiveDay(i)} className="chart-hit-area" />
                    </g>
                  );
                })}
              </svg>
              {activeDay !== null && (
                <div className="chart-tooltip" style={{ left: `${Math.min(Math.max(5 + activeDay * 15, 12), 88)}%` }}>
                  <div className="tooltip-day">{weeklyData[activeDay].day}</div>
                  <div className="tooltip-row">
                    <span>Diet</span>
                    <span className="font-bold">{weeklyData[activeDay].diet}%</span>
                  </div>
                  <div className="tooltip-row">
                    <span>Therapy</span>
                    <span className="font-bold">{weeklyData[activeDay].workout}%</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="x-axis">
            {weeklyData.map((d, i) => (
              <span key={i} className="x-label" style={{ left: `${(5 + i * 15)}%` }}>{d.day}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // --- DIET VIEW ---
  const DietView = () => (
    <div className="view-container animate-slide-in">
      <div className="diet-summary-card" onClick={() => setIsDietDetailOpen(true)}>
        <div className="card-top">
          <h3 className="card-title"><Utensils size={20} className="mr-3 text-blue" /> Today's Diet Protocol</h3>
          <div className="log-action">
            <Target size={14} className="mr-1" /> Log Meals
          </div>
        </div>
        <div className="meal-preview-list">
          {todayDiet && typeof todayDiet === 'object' ? (
            Object.entries(todayDiet)
              .filter(([, val]) => val && val !== '') // filter out empty entries
              .map(([mealName, meal]) => {
                const displayName = mealName.charAt(0).toUpperCase() + mealName.slice(1);
                const mealContent = typeof meal === 'object' ? (meal.meal || meal.description || JSON.stringify(meal)) : String(meal);
                // Pick a color class based on common meal names
                const colorClass = mealName.toLowerCase().includes('breakfast') ? 'name-breakfast'
                  : mealName.toLowerCase().includes('lunch') ? 'name-lunch'
                  : mealName.toLowerCase().includes('dinner') ? 'name-dinner'
                  : '';
                return (
                  <div className="meal-preview-item" key={mealName}>
                    <span className={`meal-name ${colorClass}`}>{displayName}</span>
                    <span className="meal-divider">—</span>
                    <span className="meal-content" style={{ whiteSpace: 'normal', color: 'var(--clinical-slate-700)', flex: 1 }}>
                      {mealContent}
                    </span>
                  </div>
                );
              })
          ) : (
            <p className="no-plan-text" style={{ color: 'var(--clinical-slate-400)', padding: '12px 0', textAlign: 'center' }}>No diet protocol found for today.</p>
          )}
        </div>
        <div className="card-edge" />
      </div>

      <div className="diet-analytics-grid">
        <div className="caloric-card">
          <h3 className="section-title">Caloric Intake vs Target</h3>
          <div className="caloric-visual">
            <div className="caloric-circle-wrapper">
              <svg className="caloric-circle" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" className="cal-bg" />
                <circle cx="50" cy="50" r="40" className="cal-fg" strokeDasharray={`${251.2 * dietProgress / 100} 251.2`} />
              </svg>
              <div className="cal-center">
                <span className="cal-pct">{dietProgress}%</span>
                <span className="cal-tag">LOGGED</span>
              </div>
            </div>
            <div className="cal-data">
              <div className="data-box">
                <span className="box-label">Target</span>
                <span className="box-value target-val">{todayCalories.target} kcal</span>
              </div>
              <div className="data-box">
                <span className="box-label">Consumed</span>
                <span className="box-value consume-val">
                  {todayCalories.consumed} kcal
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="projection-card">
          <h3 className="section-title">Future Recovery Projection</h3>
          <div className="projection-box">
            <div className="chart-inner h-[160px]">
              <div className="y-axis">
                <span className="axis-label" style={{ top: '0%' }}>100%</span>
                <span className="axis-label" style={{ top: '50%' }}>50%</span>
                <span className="axis-label" style={{ top: '100%' }}>0%</span>
              </div>
              <div className="svg-container">
                <svg className="projection-svg" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <rect x="0" y="5" width="100" height="15" fill="#F8FAFC" />
                  <line x1="0" y1="5" x2="0" y2="35" className="v-grid-line" />
                  <line x1={timeProgressX} y1="5" x2={timeProgressX} y2="35" className="v-grid-line current-line" />
                  <line x1="100" y1="5" x2="100" y2="35" className="v-grid-line" />
                  <polyline points={expectedLinePoints} className="line-expected" />
                  <polyline points={actualLinePoints} className="line-actual" />
                  <circle cx={timeProgressX} cy={mapRecoveryY(overallProgress)} r="1.5" className="curr-point" />
                </svg>
                <div className="projection-legend">
                  <div className="legend-item"><div className="line-sample dash"></div> Expected</div>
                  <div className="legend-item"><div className="line-sample solid"></div> Actual</div>
                </div>
              </div>
            </div>
            <div className="x-axis px-0 h-4 mt-2">
              <span className="x-label" style={{ left: '0%' }}>Start</span>
              <span className="x-label curr-label" style={{ left: `${timeProgressX}%` }}>Now</span>
              <span className="x-label" style={{ left: '100%' }}>Goal</span>
            </div>
          </div>
          <p className="projection-footer">Estimated full recovery in <span className="font-bold text-blue">4 weeks</span>.</p>
        </div>
      </div>
    </div>
  );

  // --- WORKOUT VIEW ---
  const WorkoutView = () => {
    const handleProceed = async (ex) => {
      setSelectedExercise(ex);
      setWorkoutViewState('demo');
      setShowSideBySide(false);
      setDemoFrontLoaded(false);
      setDemoSideLoaded(false);
      setDemoFrontError(false);
      setDemoSideError(false);

      // Auto-fetch video data
      if (muscleWikiCache[ex.name]) {
        setDemoVideoData(muscleWikiCache[ex.name]);
        setDemoVideoLoading(false);
        return;
      }

      setDemoVideoData(null);
      setDemoVideoLoading(true);
      try {
        const res = await fetch(`/musclewiki-video?name=${encodeURIComponent(ex.name)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.found && data.videos) {
            muscleWikiCache[ex.name] = data;
            setDemoVideoData(data);
            return;
          }
        }
        setDemoVideoData(null);
      } catch (err) {
        console.error('Error fetching demo video:', err);
        setDemoVideoData(null);
      } finally {
        setDemoVideoLoading(false);
      }
    };

    const handleStartExercise = () => {
      setWorkoutViewState('live');
    };

    const handleBackToList = () => {
      setWorkoutViewState('list');
      setSelectedExercise(null);
      setDemoVideoData(null);
      setDemoVideoLoading(false);
      setDemoFrontLoaded(false);
      setDemoSideLoaded(false);
      setLiveRepCount(0);
    };

    // 1. ROUTINE LIST
    if (workoutViewState === 'list') {
      return (
        <div className="workout-view-container">
          <div className="routine-card">
            <div className="routine-header">
              <div>
                <h3 className="routine-title">
                  <Activity size={28} style={{ marginRight: 12, color: 'var(--clinical-blue)' }} /> Prescribed Therapy Routine
                </h3>
                <p className="routine-subtitle">Complete your assigned physical therapy protocols to ensure optimal healing trajectory.</p>
              </div>
              <div className="phase-badge">
                <Info size={18} style={{ marginRight: 8 }} />
                <span>Phase: Mobility Correction</span>
              </div>
            </div>

            {/* --- TOP KPI CARDS REMOVED TO CONSOLIDATE PERFORMANCE ON INDIVIDUAL EXERCISE CARDS --- */}
            
            <div className="exercise-grid">
              {exercises.length === 0 || (exercises.length === 1 && exercises[0].name === 'Rest & Recovery') ? (
                <div className="rest-day-hero" style={{ 
                  gridColumn: '1 / -1', width: '100%',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', 
                  justifyContent: 'center', minHeight: '400px', 
                  background: 'linear-gradient(145deg, #ffffff, #f8fafc)',
                  border: '1px solid var(--clinical-blue-border, #bfdbfe)',
                  borderRadius: '24px', padding: '40px 20px',
                  boxShadow: '0 10px 30px rgba(37,99,235,0.05)',
                  textAlign: 'center'
                }}>
                  <div className="rest-svg-container" style={{ position: 'relative', width: '200px', height: '200px', marginBottom: '24px' }}>
                    {/* Beautiful Abstract Recovery SVG */}
                    <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%', animation: 'float 6s ease-in-out infinite' }}>
                      <defs>
                        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                        </radialGradient>
                        <linearGradient id="battery" x1="0%" y1="100%" x2="0%" y2="0%">
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="100%" stopColor="#34d399" />
                        </linearGradient>
                      </defs>
                      <circle cx="100" cy="100" r="90" fill="url(#glow)" />
                      <circle cx="100" cy="100" r="70" fill="none" stroke="#e2e8f0" strokeWidth="4" strokeDasharray="10 10" />
                      
                      {/* Battery Body */}
                      <rect x="75" y="60" width="50" height="80" rx="8" fill="white" stroke="#94a3b8" strokeWidth="4" />
                      <path d="M90 56 L110 56 A4 4 0 0 1 114 60 L86 60 A4 4 0 0 1 90 56 Z" fill="#94a3b8" />
                      
                      {/* Battery Juice (Animated) */}
                      <rect x="81" y="70" width="38" height="64" rx="4" fill="url(#battery)">
                        <animate attributeName="height" from="10" to="64" dur="2s" fill="freeze" calcMode="spline" keySplines="0.4 0 0.2 1" />
                        <animate attributeName="y" from="124" to="70" dur="2s" fill="freeze" calcMode="spline" keySplines="0.4 0 0.2 1" />
                      </rect>
                      
                      {/* Plus/Energy symbol */}
                      <path d="M100 90 L100 114 M88 102 L112 102" stroke="white" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
                      
                      {/* Orbiting particles */}
                      <circle cx="100" cy="20" r="6" fill="#3b82f6">
                        <animateTransform attributeName="transform" type="rotate" from="0 100 100" to="360 100 100" dur="8s" repeatCount="indefinite" />
                      </circle>
                      <circle cx="100" cy="180" r="4" fill="#6366f1">
                        <animateTransform attributeName="transform" type="rotate" from="360 100 100" to="0 100 100" dur="12s" repeatCount="indefinite" />
                      </circle>
                    </svg>
                    <style>{`@keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }`}</style>
                  </div>
                  
                  <h3 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--clinical-slate-800)', marginBottom: '8px' }}>Active Recovery Day</h3>
                  <p style={{ fontSize: '15px', color: 'var(--clinical-slate-500)', maxWidth: '400px', margin: '0 auto 24px', lineHeight: 1.6 }}>
                    Muscle growth and joint repair happen while you rest. Take today off from heavy loading to ensure optimal recovery for tomorrow's therapy session.
                  </p>
                  
                  <button 
                    onClick={() => toggleWorkout(0, 'Rest & Recovery')} 
                    style={{
                      padding: '12px 32px',
                      borderRadius: '50px',
                      background: completedWorkouts.includes(`${todayKey}_Rest & Recovery`) ? '#10b981' : 'var(--clinical-blue)',
                      color: 'white',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.3s ease',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.15)'
                    }}
                  >
                    {completedWorkouts.includes(`${todayKey}_Rest & Recovery`) ? <CheckCircle2 size={18} /> : <Activity size={18} />}
                    {completedWorkouts.includes(`${todayKey}_Rest & Recovery`) ? 'Recovery Logged!' : 'Acknowledge Recovery'}
                  </button>
                </div>
              ) : exercises.length > 0 ? (
                exercises.map((workout, i) => {
                  const isDone = completedWorkouts.includes(`${todayKey}_${workout.name}`);
                  return (
                    <div key={i} className={`exercise-card ${isDone ? 'exercise-card--done' : ''}`}>
                      <div className={`exercise-icon-box ${isDone ? 'exercise-icon-box--done' : ''}`}>
                        {isDone ? <CheckCircle2 size={40} /> : <Dumbbell size={40} />}
                      </div>
                      <div className="exercise-details">
                        <div className="exercise-name">{workout.name}</div>
                        <div className="exercise-target-row">
                          <Target size={14} style={{ marginRight: 6, color: 'var(--clinical-blue)' }} /> 
                          {workout.target_muscle || workout.target || 'General'}
                        </div>
                        <p className="exercise-description">{workout.instructions || workout.info || plan?.notes || 'Follow prescribed form carefully.'}</p>
                        <div className="exercise-meta">
                          <span className="exercise-tag">{workout.sets || '3'} x {workout.reps || '12'}</span>
                        </div>

                        {/* --- EXERCISE PERFORMANCE METRICS --- */}
                        {exerciseMetrics[workout.name] && (
                          <div className="exercise-performance-metrics clinical-metric-group">
                            <div className="performance-metric-badge premium-badge" title="Energy Output">
                              <span className="perf-icon">⚡</span>
                              <span className="perf-val">{exerciseMetrics[workout.name].calories.toFixed(1)}</span>
                              <span className="perf-unit">kcal</span>
                            </div>
                            <div className="performance-metric-badge premium-badge" title="Technique Precision">
                              <span className="perf-icon">🎯</span>
                              <span className="perf-val">{exerciseMetrics[workout.name].accuracy}%</span>
                              <span className="perf-unit">Accuracy</span>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="exercise-action-btns">
                        {!isDone && workout.name !== 'Rest & Recovery' && (
                          <button onClick={() => handleProceed(workout)} className="btn-exercise-proceed">
                            Proceed
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="no-exercises-msg">
                  <Dumbbell size={48} style={{ color: 'var(--clinical-slate-300)', marginBottom: 16 }} />
                  <p>No exercises prescribed for today. Rest and recover! 😴</p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // 2. DEMO MODE (Videos loaded inline + Start Exercise CTA)
    if (workoutViewState === 'demo') {
      const frontUrl = demoVideoData?.videos?.front || null;
      const sideUrl = demoVideoData?.videos?.side || null;
      const hasFront = frontUrl && !demoFrontError;
      const hasSide = sideUrl && !demoSideError;

      return (
        <div className="workout-view-container workout-demo-container">
          <button onClick={handleBackToList} className="back-link">
            <ArrowLeft size={18} style={{ marginRight: 8 }} /> Back to Routine
          </button>
          
          <div className="demo-stage">
            <div className="demo-stage-header">
              <h2 className="demo-exercise-name">{selectedExercise?.name}</h2>
              <p className="demo-exercise-subtitle">Watch the technique demonstration before starting.</p>
              <div className="demo-exercise-meta">
                <span className="exercise-tag">{selectedExercise?.sets || '3'} sets × {selectedExercise?.reps || '12'} reps</span>
                <span className="exercise-tag" style={{ background: 'var(--clinical-blue-soft)', color: 'var(--clinical-blue)', borderColor: 'var(--clinical-blue-border)' }}>
                  {selectedExercise?.target_muscle || selectedExercise?.target || 'General'}
                </span>
              </div>
            </div>

            <div className={`video-layout ${showSideBySide ? '' : 'video-layout--single'}`}>
              {/* Front Video Slot */}
              <div className={`video-slot ${showSideBySide && hasSide && demoSideLoaded ? 'video-slot--half' : 'video-slot--full'}`}>
                {(demoVideoLoading || (hasFront && !demoFrontLoaded)) && (
                  <div className="slot-loader">
                    <div className="slot-loader-spinner" />
                    <span className="slot-loader-text">{demoVideoLoading ? 'Locating workout data…' : 'Loading video…'}</span>
                  </div>
                )}
                {hasFront && (
                  <video
                    src={frontUrl}
                    autoPlay loop muted playsInline preload="auto"
                    style={{ display: demoFrontLoaded ? 'block' : 'none' }}
                    onLoadedData={() => setDemoFrontLoaded(true)}
                    onCanPlay={() => setDemoFrontLoaded(true)}
                    onError={() => setDemoFrontError(true)}
                  />
                )}
                {!demoVideoLoading && !hasFront && !demoFrontLoaded && (
                  <div className="slot-empty">
                    <PlayCircle size={48} className="play-icon" />
                    <span className="slot-empty-text">No video available</span>
                  </div>
                )}
                <div className="slot-label">Angle 1: Frontal</div>
              </div>

              {showSideBySide && (
                <div className="video-slot video-slot--half" style={{ animation: 'slideInRight 0.5s ease-out' }}>
                  {(hasSide && !demoSideLoaded) && (
                    <div className="slot-loader">
                      <div className="slot-loader-spinner" />
                      <span className="slot-loader-text">Loading side view…</span>
                    </div>
                  )}
                  {hasSide && (
                    <video
                      src={sideUrl}
                      autoPlay loop muted playsInline preload="auto"
                      style={{ display: demoSideLoaded ? 'block' : 'none' }}
                      onLoadedData={() => setDemoSideLoaded(true)}
                      onCanPlay={() => setDemoSideLoaded(true)}
                      onError={() => setDemoSideError(true)}
                    />
                  )}
                  {!hasSide && (
                    <div className="slot-empty">
                      <PlayCircle size={48} className="play-icon" />
                      <span className="slot-empty-text">Side view unavailable</span>
                    </div>
                  )}
                  <div className="slot-label">Angle 2: Lateral</div>
                </div>
              )}
            </div>

            <div className="demo-bottom-controls">
              {hasFront && hasSide && (
                <button 
                  onClick={() => setShowSideBySide(!showSideBySide)}
                  className="btn-toggle-angle"
                >
                  <Maximize2 size={14} style={{ marginRight: 8 }} />
                  {showSideBySide ? 'Single View' : 'View Different Angle'}
                </button>
              )}
              
              <button onClick={handleStartExercise} className="btn-start-live">
                Start Exercise — AI Tracking
              </button>
            </div>
          </div>
        </div>
      );
    }

    // 3. LIVE AI POSTURE TRACKING MODE (Embedded CameraView)
    if (workoutViewState === 'live') {

      // ── FULLSCREEN MODE ──
      if (isFullscreen) {
        return (
          <div className="tracker-fullscreen">
            <CameraView
              embedded={true}
              exerciseName={selectedExercise?.name}
              targetSets={parseInt(selectedExercise?.sets)}
              targetReps={parseInt(selectedExercise?.reps)}
              workoutDay={todayKey}
              onClose={() => { setIsFullscreen(false); handleBackToList(); }}
              onRepUpdate={(count) => setLiveRepCount(count)}
              onComplete={() => {
                const idx = exercises.findIndex(ex => ex.name === selectedExercise?.name);
                if (idx !== -1) markWorkoutAsDone(idx, selectedExercise?.name);
              }}
            />
            {/* Floating overlay UI */}
            <div className="fs-overlay-top">
              <button onClick={() => setIsFullscreen(false)} className="fs-back-btn">
                <ArrowLeft size={16} /> Exit Fullscreen
              </button>
              <div className="fs-exercise-name">{selectedExercise?.name}</div>
            </div>
            <div className="fs-overlay-bottom">
              <div className="fs-rep-badge">
                <span className="fs-rep-num">{String(liveRepCount).padStart(2, '0')}</span>
                <span className="fs-rep-label">/ {selectedExercise?.reps || '15'} REPS</span>
              </div>
            </div>
          </div>
        );
      }

      // ── NORMAL LIVE MODE ──
      return (
        <div className="workout-live-layout">
          {/* Tracker Area */}
          <div className="live-tracker-column">
            <div className="tracker-stage">

              <CameraView
                embedded={true}
                exerciseName={selectedExercise?.name}
                targetSets={parseInt(selectedExercise?.sets)}
                targetReps={parseInt(selectedExercise?.reps)}
                onClose={handleBackToList}
                onRepUpdate={(count) => setLiveRepCount(count)}
                onComplete={() => {
                  const idx = exercises.findIndex(ex => ex.name === selectedExercise?.name);
                  if (idx !== -1) markWorkoutAsDone(idx, selectedExercise?.name);
                }}
              />
            </div>
          </div>

          {/* Info Column */}
          <div className="live-info-column">
            <button onClick={handleBackToList} className="back-link" style={{ marginBottom: '8px' }}>
              <ArrowLeft size={18} style={{ marginRight: 8 }} /> Back to Routine
            </button>

            <div className="info-cards-row" style={{ display: 'flex', gap: '16px' }}>
              <div className="rep-counter-card" style={{ flex: 1 }}>
                <div className="rep-label">Rep Counter</div>
                <div className="rep-count">{String(liveRepCount).padStart(2, '0')} / {selectedExercise?.reps || '15'}</div>
              </div>

              <div className="live-exercise-info-card" style={{ flex: 1 }}>
                <div className="rep-label">Current Exercise</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'white', marginTop: 4, lineHeight: 1.2 }}>{selectedExercise?.name}</div>
              </div>
            </div>

            {/* Reference Videos */}
            {(demoVideoData?.videos?.front || demoVideoData?.videos?.side) && (
              <div className="ref-card">
                <h4 className="ref-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Reference Video</span>
                  {demoVideoData?.videos?.front && demoVideoData?.videos?.side && (
                    <button 
                      onClick={() => setShowSideBySide(!showSideBySide)}
                      style={{
                        background: 'rgba(37,99,235,0.1)', color: 'var(--clinical-blue)', border: 'none',
                        padding: '8px 16px', borderRadius: '24px', fontSize: '12px', fontWeight: 'bold',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                      }}
                    >
                      <Maximize2 size={14} /> View Different Angle
                    </button>
                  )}
                </h4>
                <div className="ref-videos-row" style={{ display: 'block', height: '100%' }}>
                  <div className="mini-video" style={{ overflow: 'hidden', height: '100%' }}>
                    {/* If showSideBySide is true, show FRONT. If false, show SIDE. (Reusing existing state variable which defaults to false) */}
                    <video 
                      key={showSideBySide || !demoVideoData?.videos?.side ? 'front' : 'side'}
                      src={(showSideBySide || !demoVideoData?.videos?.side) ? demoVideoData.videos.front : demoVideoData.videos.side} 
                      autoPlay loop muted playsInline 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                    <div className="video-tag">
                      {(showSideBySide || !demoVideoData?.videos?.side) ? 'Front Angle' : 'Side Angle'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }
  };

  if (authLoading || (currentUser && loading)) {
    return (
      <div className="workspace-page clinical-theme" style={{ 
        height: '100vh', width: '100%', display: 'flex', alignItems: 'center', 
        justifyContent: 'center', background: '#f8fafc', color: '#2563eb',
        fontFamily: 'system-ui, sans-serif'
      }}>
        <div style={{
          width: '24px', height: '24px', border: '2px solid rgba(37,99,235,0.1)',
          borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin 1s linear infinite',
          marginRight: '12px'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div className="ws-loading">Initializing Portal…</div>
      </div>
    );
  }

  return (
    <div className="workspace-page clinical-theme">
      {/* ---------------- DESKTOP TOP NAVBAR ---------------- */}
      {workoutViewState !== 'live' && (
        <header className="desktop-navbar">
          <div className="navbar-left">
            <div className="brand-logo">
              <Stethoscope className="text-blue" size={20} />
            </div>
            <div className="brand-text">
              <h1 className="brand-name">NutriFit</h1>
              <p className="brand-tag">Clinical Portal</p>
            </div>
          </div>

          <nav className="navbar-center">
            <button 
              onClick={() => setActiveTab('home')}
              className={`nav-btn ${activeTab === 'home' ? 'active' : ''}`}
            >
              <Home size={16} className="mr-2" />
              <span>Dashboard</span>
            </button>
            <button 
              onClick={() => setActiveTab('diet')}
              className={`nav-btn ${activeTab === 'diet' ? 'active' : ''}`}
            >
              <Utensils size={16} className="mr-2" />
              <span>Diet Plan</span>
            </button>
            <button 
              onClick={() => setActiveTab('workout')}
              className={`nav-btn ${activeTab === 'workout' ? 'active' : ''}`}
            >
              <Activity size={16} className="mr-2" />
              <span>Therapy</span>
            </button>
          </nav>

          <div className="navbar-right">
            <button className="notif-btn">
              <Bell size={16} />
              <span className="notif-dot"></span>
            </button>
            <div className="user-profile-pill" onClick={handleLogout} title="Click to Logout">
              <div className="pill-avatar">
                <User size={14} />
              </div>
              <span className="pill-name">{userData?.name || "User"}</span>
              <LogOut size={12} className="ml-2 opacity-50" />
            </div>
          </div>
        </header>
      )}

      {/* ---------------- MAIN CONTENT AREA ---------------- */}
      <div className="content-container">
        {/* MOBILE HEADER */}
        {workoutViewState !== 'live' && (
          <header className="mobile-header">
            <div className="brand-logo">
              <Stethoscope className="text-blue" size={20} />
              <h1 className="brand-name ml-2">NutriFit</h1>
            </div>
            <button className="user-btn" onClick={handleLogout}><User size={16} /></button>
          </header>
        )}

        {/* PAGE TITLE & DAY SWITCHER */}
        {workoutViewState !== 'live' && (
          <div className="page-header" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h2 className="page-title">
              {activeTab === 'home' ? 'Clinical Dashboard' : activeTab === 'diet' ? 'Nutrition Protocol' : 'Physical Therapy'}
            </h2>
            
            {/* Day Switcher UI (Hidden on Dashboard, shown on Protocol tabs) */}
            {plan && workoutViewState === 'list' && activeTab !== 'home' && (
              <div className="day-switcher" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none', marginBottom: '8px' }}>
                {[1, 2, 3, 4, 5, 6, 7].map(d => (
                  <button 
                    key={d}
                    onClick={() => {
                      setTodayKey(`day_${d}`);
                      // Also reset scroll for better UX on mobile
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    style={{
                      padding: '8px 18px',
                      borderRadius: '24px',
                      border: '1px solid var(--clinical-blue-border, #bfdbfe)',
                      background: todayKey === `day_${d}` ? 'var(--clinical-blue, #2563eb)' : '#fff',
                      color: todayKey === `day_${d}` ? '#fff' : 'var(--clinical-blue, #2563eb)',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: todayKey === `day_${d}` ? '0 4px 12px rgba(37,99,235,0.25)' : '0 2px 4px rgba(0,0,0,0.02)'
                    }}
                  >
                    Day {d}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dynamic Content Views */}
        <main className="main-viewport custom-scrollbar">
          <div className="viewport-content">
            {!plan ? (
              <div className="no-plan-card clinical">
                <div className="npc-icon">📋</div>
                <h3>System Waiting for Prescription</h3>
                <p>
                  {userRole === 'insider'
                    ? "Your clinical practitioner hasn't assigned a protocol yet."
                    : "Generate your AI-driven plan to begin your recovery journey."
                  }
                </p>
                {userRole === 'outsider' && (
                  <button className="btn-clinical-primary" onClick={() => navigate('/chat')}>
                    🤖 Consult AI Coach
                  </button>
                )}
              </div>
            ) : (
              <>
                {activeTab === 'home' && HomeView()}
                {activeTab === 'diet' && DietView()}
                {activeTab === 'workout' && WorkoutView()}
              </>
            )}
          </div>
        </main>
      </div>

      {/* ---------------- MOBILE STICKY FOOTER ---------------- */}
      <footer className="mobile-footer">
        <div className="footer-nav">
          <button 
            onClick={() => {setActiveTab('diet'); setWorkoutViewState('list');}} 
            className={`footer-btn ${activeTab === 'diet' ? 'active' : ''}`}
          >
            <Utensils size={20} />
            <span>Diet</span>
          </button>
          <button 
            onClick={() => {setActiveTab('home'); setWorkoutViewState('list');}} 
            className={`footer-btn home-center ${activeTab === 'home' ? 'active' : ''}`}
          >
            <Home size={22} />
          </button>
          <button 
            onClick={() => {setActiveTab('workout'); setWorkoutViewState('list');}} 
            className={`footer-btn ${activeTab === 'workout' ? 'active' : ''}`}
          >
            <Activity size={20} />
            <span>Therapy</span>
          </button>
        </div>
      </footer>

      {/* ---------------- SIDE DRAWERS & MODALS ---------------- */}
      {isDietDetailOpen && (
        <div className="drawer-overlay" onClick={() => setIsDietDetailOpen(false)}>
          <div className="drawer-content animate-slide-in-right" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h2 className="drawer-title"><Utensils size={18} className="mr-2 text-blue" /> Diet Protocol Logging</h2>
              <button onClick={() => setIsDietDetailOpen(false)} className="close-btn"><X size={18} /></button>
            </div>
            <div className="drawer-body custom-scrollbar">
              {['Breakfast', 'Lunch', 'Snacks', 'Dinner'].map((meal) => {
                const mealKey = `${todayKey}_${meal.toLowerCase()}`;
                const isCompleted = dietStatus.includes(mealKey);
                return (
                <div 
                  key={meal} 
                  onClick={() => setDietStatus(p => p.includes(mealKey) ? p.filter(k => k !== mealKey) : [...p, mealKey])} 
                  className={`log-item ${isCompleted ? 'completed' : ''}`}
                >
                  <div className="log-info">
                    <h4 className="log-meal-name">{meal}</h4>
                    <p className="log-meal-desc">
                      {todayDiet?.[meal.toLowerCase()] 
                        ? (typeof todayDiet[meal.toLowerCase()] === 'object' ? todayDiet[meal.toLowerCase()].meal : todayDiet[meal.toLowerCase()])
                        : "Plan detail loading from clinical database..."}
                    </p>
                  </div>
                  <div className="log-checkbox">
                    {isCompleted ? <CheckCircle2 size={24} className="text-emerald" /> : <Circle size={24} className="text-slate-300" />}
                  </div>
                </div>
                );
              })}
              <div className="drawer-footer">
                 <p className="text-xs text-slate-400 text-center italic mt-4">Logging helps track your recovery trajectory accurately.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedVideo && (
        <VideoModal 
          exerciseName={selectedVideo.name}
          videos={selectedVideo.videos}
          muscleGroup={selectedVideo.muscle_group}
          difficulty={selectedVideo.difficulty}
          isLoading={videoLoading}
          onClose={() => setSelectedVideo(null)}
          onTrackExercise={(exName) => {
            setSelectedVideo(null);
            const ex = exercises.find(e => e.name === exName) || { name: exName };
            setSelectedExercise(ex);
            setActiveTab('workout');
            setWorkoutViewState('demo');
            // Trigger auto-fetch
            if (muscleWikiCache[exName]) {
              setDemoVideoData(muscleWikiCache[exName]);
              setDemoVideoLoading(false);
            }
          }}
        />
      )}
    </div>
  );
}
