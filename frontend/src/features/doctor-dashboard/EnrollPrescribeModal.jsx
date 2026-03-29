/**
 * EnrollPrescribeModal.jsx
 * ========================
 * Unified modal: Create patient account + assign initial prescription in one flow.
 * Merges AddPatientModal (account fields) + PrescriptionModal (prescription UI).
 *
 * Uses the .rx-* CSS classes defined in DoctorDashboard.css.
 * Fully self-contained: manages account, diet, exercise, AI, and approval state.
 *
 * Props:
 *   - doctorUid : string       (currentUser.uid)
 *   - onSuccess : () => void   (refresh patient list after creation)
 *   - onClose   : () => void
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import exerciseData from '../../data/exercises.json';

ChartJS.register(ArcElement, Tooltip, Legend);

const API_URL = 'http://localhost:8000';

/* ─────────────────────────────────────────────────────────────────────────────
   ExerciseAutocompleteInput Component
   Strict autocomplete for exercise names.
   ────────────────────────────────────────────────────────────────────────── */
const ExerciseAutocompleteInput = ({ value, onChange }) => {
  const [inputValue, setInputValue] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef(null);

  function debounce(fn, delay) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };
  }

  function searchExercises(data, query) {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const results = data.map(ex => {
      let score = 0;
      const lowerName = ex.name.toLowerCase();
      const lowerPrimary = ex.primary.toLowerCase();
      
      // Exact matches get massive boosts
      if (lowerName === q) score += 100;
      if (lowerPrimary === q) score += 80;
      
      // Starts with matches
      if (lowerName.startsWith(q)) score += 50;
      if (lowerPrimary.startsWith(q)) score += 40;

      // Substring matches
      if (ex.primary.includes(q)) score += 20;
      if (ex.name.toLowerCase().includes(q)) score += 30; // Name often has equipment/variant, we want to see it
      
      // Aliases and Tokens
      if (ex.aliases.some(a => a.toLowerCase().includes(q))) score += 10;
      if (ex.tokens.some(t => t.toLowerCase().includes(q))) score += 5;
      
      return { ...ex, score };
    })
    .filter(ex => ex.score > 0)
    .sort((a, b) => b.score - a.score);

    // DEDUPLICATE BY NAME: Ensure each name only appears once (Aggressive Normalization)
    const seenNames = new Set();
    return results.filter(ex => {
      // Normalize to "push up" from "Push-Up ", "push up", "PUSHUP", etc.
      const normalizedName = ex.name.toLowerCase()
        .replace(/-/g, ' ')      // Hyphen to space
        .replace(/\s+/g, ' ')     // Double spaces to single
        .trim();                 // Clean edges
        
      if (seenNames.has(normalizedName)) return false;
      seenNames.add(normalizedName);
      return true;
    });
  }

  const debouncedSearch = useCallback(debounce((query) => {
    if (query.length > 1) {
      const results = searchExercises(exerciseData, query);
      if (results.length > 0) {
        setSuggestions(results.slice(0, 15)); // Show more variants as requested
        setError('');
      } else {
        setSuggestions([]);
        setError("No exercise found");
      }
    } else {
      setSuggestions([]);
      setError('');
    }
  }, 200), []);

  useEffect(() => {
    if (!isLocked) {
      debouncedSearch(inputValue);
    }
  }, [inputValue, isLocked, debouncedSearch]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setSuggestions([]);
        setError('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (exercise) => {
    onChange(exercise.name);
    setInputValue(exercise.name);
    setSuggestions([]);
    setError('');
    setIsLocked(true);
  };
  
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    if(isLocked) setIsLocked(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        handleSelect(suggestions[highlightedIndex]);
      } else if (suggestions.length > 0) {
        handleSelect(suggestions[0]);
      }
    } else if (e.key === 'Escape') {
      setSuggestions([]);
      setError('');
    }
  };

  const ghostSuggestion = suggestions.length > 0 && inputValue && suggestions[0].name.toLowerCase().startsWith(inputValue.toLowerCase())
    ? suggestions[0].name.substring(inputValue.length)
    : "";

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flex: 1 }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if(isLocked) setIsLocked(false); }}
          placeholder="Type exercise..."
          style={{
            width: '100%', padding: '6px 10px', fontSize: '14px', fontWeight: '700',
            border: isLocked ? '2px solid #16a34a' : (error ? '2px solid #dc2626' : '2px solid #3b82f6'),
            borderRadius: '8px', outline: 'none',
            background: '#fff', boxShadow: '0 0 0 3px ' + (isLocked ? 'rgba(22, 163, 74, 0.1)' : (error ? 'rgba(220, 38, 38, 0.1)' : 'rgba(59, 130, 246, 0.1)')),
            position: 'relative',
            zIndex: 2,
          }}
        />
        {!isLocked && ghostSuggestion && (
          <div style={{
            position: 'absolute',
            top: '0',
            left: '0',
            padding: '6px 10px',
            fontSize: '14px',
            fontWeight: '700',
            color: '#cbd5e1',
            pointerEvents: 'none',
            zIndex: 1,
            whiteSpace: 'pre',
          }}>
            <span style={{visibility: 'hidden'}}>{inputValue}</span>{ghostSuggestion}
          </div>
        )}
      </div>
      {suggestions.length > 0 && !error && !isLocked && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 1000,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
          marginTop: '4px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
          overflow: 'hidden', padding: '4px',
          minWidth: '100%', width: 'max-content', maxWidth: '300px'
        }}>
          {suggestions.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setHighlightedIndex(idx)}
              style={{
                padding: '10px 12px', fontSize: '12px', cursor: 'pointer',
                borderRadius: '6px',
                background: highlightedIndex === idx ? '#eff6ff' : 'transparent',
                color: highlightedIndex === idx ? '#2563eb' : '#334155',
                fontWeight: highlightedIndex === idx ? '700' : '500'
              }}
            >
              {item.name}
            </div>
          ))}
        </div>
      )}
      {error && !isLocked && (
        <div style={{
          marginTop: '4px',
          padding: '4px 8px',
          fontSize: '12px',
          color: '#dc2626',
          background: 'rgba(220, 38, 38, 0.05)',
          borderRadius: '6px',
        }}>
          {error === "No exercise found" ? "No exercise found" : "Try 'push up' or 'curl'"}
        </div>
      )}
    </div>
  );
};


const MultiSelectDropdown = ({ options, selected, onChange, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (option) => {
    if (option === 'None') {
      onChange(['None']);
      return;
    }
    const noNone = selected.filter(o => o !== 'None');
    if (noNone.includes(option)) {
      onChange(noNone.filter(o => o !== option));
    } else {
      onChange([...noNone, option]);
    }
  };

  const displayText = selected.length === 0 
    ? placeholder 
    : selected.includes('None') && selected.length === 1 
      ? 'None' 
      : selected.filter(o => o !== 'None').join(', ');

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', padding: '10px 14px', background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', fontSize: '14px', color: selected.length ? '#1e293b' : '#94a3b8',
          fontWeight: '500'
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '90%' }}>
          {displayText}
        </span>
        <span style={{ fontSize: '12px', color: '#64748b' }}>▼</span>
      </div>
      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
          marginTop: '4px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
          maxHeight: '200px', overflowY: 'auto'
        }}>
          {options.map(opt => (
            <label key={opt} style={{
              display: 'flex', alignItems: 'center', padding: '10px 14px',
              cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '14px',
              color: '#334155', fontWeight: '500'
            }} onClick={e => e.stopPropagation()}>
              <input 
                type="checkbox" 
                checked={selected.includes(opt)}
                onChange={() => handleToggle(opt)}
                style={{ marginRight: '10px', transform: 'scale(1.1)' }}
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

const CollapsibleSection = ({ title, defaultOpen = true, children, important = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div style={{
      background: '#fff', 
      borderRadius: '12px', 
      border: important ? '2px solid #3b82f6' : '1px solid #e2e8f0',
      boxShadow: important ? '0 4px 12px rgba(59, 130, 246, 0.1)' : '0 2px 4px rgba(0,0,0,0.02)',
      marginBottom: '20px',
      overflow: 'hidden'
    }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '16px 20px', 
          background: important ? '#eff6ff' : '#f8fafc',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer',
          borderBottom: isOpen ? (important ? '1px solid #bfdbfe' : '1px solid #e2e8f0') : 'none'
        }}
      >
        <h4 style={{ 
          margin: 0, fontSize: important ? '16px' : '15px', color: important ? '#1e40af' : '#334155', 
          display: 'flex', alignItems: 'center', fontWeight: '700' 
        }}>
          {title}
        </h4>
        <span style={{ fontSize: '14px', color: '#64748b', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
      </div>
      {isOpen && (
        <div style={{ padding: '20px' }}>
          {children}
        </div>
      )}
    </div>
  );
};

export default function EnrollPrescribeModal({ doctorUid, onSuccess, onClose }) {

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [emailExists, setEmailExists] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);

  // Focus Refs
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const ageRef = useRef(null);

  /* ── Patient demographics ──────────────────────────── */
  const [patientName, setPatientName] = useState('');
  const [age, setAge]                 = useState('');
  const [gender, setGender]           = useState('');
  const [weight, setWeight]           = useState('');
  const [height, setHeight]           = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');

  /* ── Diet Specification fields ─────────────────────── */
  const [dietGoal, setDietGoal] = useState('');
  const [foodPreference, setFoodPreference] = useState('');
  const [bloodPressure, setBloodPressure] = useState('');
  const [activityLevel, setActivityLevel] = useState('');
  const [mealsPerDay, setMealsPerDay]     = useState('');
  const [restrictions, setRestrictions]   = useState([]);

  /* ── Plan type ─────────────────────────────────────── */
  const [planType, setPlanType] = useState(null); // 'diet' | 'exercise' | 'both' | null

  /* ── Diet fields ───────────────────────────────────── */
  const [breakfast, setBreakfast] = useState('');
  const [lunch, setLunch]         = useState('');
  const [dinner, setDinner]       = useState('');
  const [snacks, setSnacks]       = useState('');
  const [hydration, setHydration] = useState('');
  const [showChart, setShowChart] = useState(false);

  /* ── Exercise Specification fields ─────────────────── */
  const [workoutGoal, setWorkoutGoal] = useState('');
  const [equipment, setEquipment] = useState('');
  const [targetAreas, setTargetAreas] = useState([]);
  const [fitnessLevel, setFitnessLevel] = useState('');
  const [workoutDays, setWorkoutDays] = useState('');
  const [sessionTime, setSessionTime] = useState('');
  const [injuries, setInjuries] = useState([]);
  const [intensity, setIntensity] = useState('');

  /* ── Combined Plan fields ──────────────────────────── */
  const [sharedGoal, setSharedGoal] = useState('');
  const [sharedMedical, setSharedMedical] = useState([]);

  /* ── Exercise fields ───────────────────────────────── */
  const [exercises, setExercises] = useState([]);

  /* ── Footer ────────────────────────────────────────── */

  /* ── UI state ──────────────────────────────────────── */
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fullGeneratedPlan, setFullGeneratedPlan] = useState(null);
  const [showToast, setShowToast]   = useState(false);
  const [error, setError]           = useState('');
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [currentLoadingDay, setCurrentLoadingDay] = useState(0);
  const [allowedExercises, setAllowedExercises] = useState([]);
  const [editDayIndex, setEditDayIndex] = useState(null); // Per-day edit index
  const [editingExIdx, setEditingExIdx] = useState(null); // Per-exercise edit index
  const [pendingRemovals, setPendingRemovals] = useState([]); // Exercises to be removed on "Done"

  const toggleEdit = (i) => {
    if (editDayIndex === i) {
      // "Done" clicked: Apply pending removals first
      if (pendingRemovals.length > 0) {
        setFullGeneratedPlan(prev => {
          if (!prev) return prev;
          
          // DEEP COPY to prevent mutation bugs
          const updated = JSON.parse(JSON.stringify(prev));
          const dayK = updated.sched?.[i];
          if (!dayK || !updated.tpl) return prev;

          // Fork the template if it's shared to avoid affecting other days
          const sharedDays = updated.sched.filter(k => k === dayK).length;
          let targetKey = dayK;
          if (sharedDays > 1) {
            targetKey = `${dayK}_forked_${Date.now()}`;
            updated.sched[i] = targetKey;
            updated.tpl[targetKey] = JSON.parse(JSON.stringify(updated.tpl[dayK]));
          }

          const daySched = updated.tpl[targetKey];
          if (daySched && daySched.ex) {
            // Filter out pending removals
            daySched.ex = daySched.ex.filter((_, idx) => !pendingRemovals.includes(idx));
          }
          return updated;
        });
      }
      setEditDayIndex(null);
      setEditingExIdx(null);
      setPendingRemovals([]);
    } else {
      setEditDayIndex(i);
      setEditingExIdx(null);
      setPendingRemovals([]);
    }
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  /* ── Real-time Email Existence Check ───────────────── */
  useEffect(() => {
    if (!email || !email.includes('@')) {
      setEmailExists(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setEmailChecking(true);
      try {
        const res = await fetch(`${API_URL}/check-email?email=${encodeURIComponent(email)}`);
        if (res.ok) {
          const data = await res.json();
          setEmailExists(data.exists);
        }
      } catch (err) {
        console.error("Email check failed", err);
      } finally {
        setEmailChecking(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [email]);

  /* ── Exercise CRUD ─────────────────────────────────── */
  function addExercise() {
    setExercises(prev => [...prev, { id: Date.now().toString(), name: '', sets: 3, reps: 10 }]);
  }
  function updateExercise(id, field, value) {
    setExercises(prev => prev.map(ex => ex.id === id ? { ...ex, [field]: value } : ex));
  }

  /* ── Full Plan Edits ───────────────────────────────── */
  function updateFullPlanExercise(dayIndex, exIndex, field, value) {
    setFullGeneratedPlan(prev => {
      if (!prev || !prev.sched || !prev.tpl) return prev;
      
      const updated = JSON.parse(JSON.stringify(prev));
      const dayK = updated.sched[dayIndex];
      if (!dayK || !updated.tpl[dayK]) return prev;

      let targetKey = dayK;
      const sharedDays = updated.sched.filter(k => k === dayK).length;

      // FORK if shared, so edit doesn't hit other days
      if (sharedDays > 1) {
        targetKey = `${dayK}_forked_${Date.now()}`;
        updated.sched[dayIndex] = targetKey;
        updated.tpl[targetKey] = JSON.parse(JSON.stringify(updated.tpl[dayK]));
      }

      const daySched = updated.tpl[targetKey];
      const newExs = [...(daySched.ex || [])];
      const targetEx = newExs[exIndex];

      if (typeof targetEx === 'string') {
        const parts = targetEx.split('|');
        if (field === 'name') parts[0] = value;
        else if (field === 'sets') parts[1] = `${value}x${parts[1]?.split('x')[1] || 10}`;
        else if (field === 'reps') parts[1] = `${parts[1]?.split('x')[0] || 3}x${value}`;
        newExs[exIndex] = parts.join('|');
      } else {
        newExs[exIndex] = { ...targetEx, [field]: value };
      }
      
      daySched.ex = newExs;
      return updated;
    });
  }

  function updateFullPlanDiet(dayKey, field, value) {
    setFullGeneratedPlan(prev => {
      if (!prev) return prev;
      const newPlan = { ...prev };
      
      if (newPlan.schema_version === 2) {
        if (!newPlan.diet) newPlan.diet = { days: {} };
        if (!newPlan.diet.days) newPlan.diet.days = {};
        if (!newPlan.diet.days[dayKey]) newPlan.diet.days[dayKey] = [];
        
        let meals = newPlan.diet.days[dayKey];
        // Ensure meals is an array
        if (!Array.isArray(meals)) meals = [];
        
        // Find existing meal. It could be a string ("breakfast:Oats|300") or object ({meal_type: 'breakfast', name: 'Oats'})
        const mealIndex = meals.findIndex(m => {
          if (typeof m === 'string') return m.split(':')[0] === field;
          return m.meal_type === field;
        });

        if (mealIndex >= 0) {
          meals[mealIndex] = { meal_type: field, name: value, cal: 0 }; // Overwrite with object format
        } else {
          meals.push({ meal_type: field, name: value, cal: 0 });
        }
        newPlan.diet.days[dayKey] = meals;
      } else {
        if (!newPlan.diet_plan) newPlan.diet_plan = {};
        if (!newPlan.diet_plan[dayKey]) newPlan.diet_plan[dayKey] = {};
        newPlan.diet_plan[dayKey][field] = value;
      }
      return newPlan;
    });
  }

  function removeExercise(id) {
    setExercises(prev => prev.filter(ex => ex.id !== id));
  }

  /* ── Sequential Loading Logic (Visual Only) ───────── */
  useEffect(() => {
    let timer;
    if (generating) {
      setCurrentLoadingDay(0);
      timer = setInterval(() => {
        // Slow down to 1.5s per day to better match AI (7 * 1.5 = 10.5s)
        setCurrentLoadingDay(prev => prev < 7 ? prev + 1 : prev);
      }, 1500);
    } else {
      setCurrentLoadingDay(0);
    }
    return () => clearInterval(timer);
  }, [generating]);

  /* ── AI Generate ───────────────────────────────────── */
  const isValidExercise = (name) => {
    return name && name.trim() !== '';
  };



  const isPlanValid = () => {
    if (!fullGeneratedPlan || !fullGeneratedPlan.sched || !fullGeneratedPlan.tpl) return true;
    for (const dayKey of fullGeneratedPlan.sched) {
      const template = fullGeneratedPlan.tpl[dayKey];
      if (template && template.ex) {
        for (const exData of template.ex) {
          const name = typeof exData === 'string' ? exData.split('|')[0] : exData.name;
          if (!isValidExercise(name)) return false;
        }
      }
    }
    return true;
  };

  async function generateAI() {
    setGenerating(true);
    setShowFullPreview(true); // Open the preview overlay immediately
    try {
      const res = await fetch(`${API_URL}/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: 'new-patient', // Temporary UID for generation
          age: parseInt(age) || 25,
          gender: gender,
          weight: parseFloat(weight) || 70,
          height: parseFloat(height) || 170,
          goal: planType === 'both' ? sharedGoal : (planType === 'exercise' ? workoutGoal : (dietGoal || workoutGoal || 'Maintain')),
          medical_conditions: planType === 'both' 
            ? `${medicalHistory}${sharedMedical.length ? `, Medical: ${sharedMedical.join(', ')}` : ''}` 
            : `${medicalHistory}${bloodPressure !== 'Normal' ? `, BP: ${bloodPressure}` : ''}`,
          food_preference: foodPreference,
          restrictions: restrictions.join(', '),
          activity_level: activityLevel,
          meals_per_day: parseInt(mealsPerDay) || 3,
          plan_mode: planType === 'diet' ? 'deterministic_diet' : 'ai',
          plan_type: planType,
          workout_goal: workoutGoal,
          equipment: equipment,
          target_areas: targetAreas,
          fitness_level: fitnessLevel,
          workout_days: workoutDays,
          session_time: sessionTime,
          injuries: injuries,
          intensity: intensity
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const fullPlan = data.plan || {};
        setFullGeneratedPlan(fullPlan); // Store the full 7-day data
        setAllowedExercises(fullPlan.allowed_exercises || []);
        let day1Diet = {};
        let day1Workout = {};

        if (fullPlan.schema_version === 2) {
          // V2 Deterministic Schema Parsing
          const d1Diet = fullPlan.diet?.[0] || {};
          const meals = d1Diet.meals || {};
          
          day1Diet = {
            breakfast: meals.breakfast ? `${meals.breakfast.name} (${meals.breakfast.cal || 0} cal)` : '',
            lunch: meals.lunch ? `${meals.lunch.name} (${meals.lunch.cal || 0} cal)` : '',
            dinner: meals.dinner ? `${meals.dinner.name} (${meals.dinner.cal || 0} cal)` : '',
          };

          const day1Key = fullPlan.sched?.[0]; 
          const d1Template = fullPlan.tpl?.[day1Key] || {};
          
          day1Workout = {
            exercises: (d1Template.ex || []).map(str => {
               const parts = str.split('|');
               const name = parts[0] || str;
               const setsReps = parts[1] ? parts[1].split('x') : ['3', '10'];
               return { name, sets: setsReps[0] || 3, reps: setsReps[1] || 10 };
            })
          };
        } else {
          // Gemini / Deterministic returns a 7-day structure. We extract Day 1 for the initial preview edit.
          day1Diet = fullPlan.diet_plan?.day_1 || {};
          day1Workout = fullPlan.workout_plan?.day_1 || {};
        }

        if (day1Diet.breakfast) {
          const b = day1Diet.breakfast;
          setBreakfast(typeof b === 'object' ? `${b.meal}${b.calories ? ` (${b.calories} cal)` : ''}` : b);
        }
        if (day1Diet.lunch) {
          const l = day1Diet.lunch;
          setLunch(typeof l === 'object' ? `${l.meal}${l.calories ? ` (${l.calories} cal)` : ''}` : l);
        }
        if (day1Diet.dinner) {
          const d = day1Diet.dinner;
          setDinner(typeof d === 'object' ? `${d.meal}${d.calories ? ` (${d.calories} cal)` : ''}` : d);
        }
        if (day1Diet.snacks) {
          const s = day1Diet.snacks;
          setSnacks(typeof s === 'object' ? `${s.meal}${s.calories ? ` (${s.calories} cal)` : ''}` : s);
        } else {
          setSnacks('• Mixed Nuts\n• Greek Yogurt');
        }
        setHydration('• Target 3-4 Liters of water daily\n• Include electrolytes post-workout');

        if (day1Workout.exercises) {
          setExercises(day1Workout.exercises.map((ex, i) => ({
            id: `ex_${i}`, 
            name: ex.name || '', 
            sets: ex.sets || 3, 
            reps: ex.reps || 10,
          })));
        }
        setShowChart(true);
        setIsPreviewMode(true); // Transition to preview/edit phase
      } else {
        simulateFallback();
      }
    } catch (err) {
      console.error("[AI] Generation failed:", err);
      simulateFallback();
    } finally {
      setGenerating(false);
    }
  }

  function simulateFallback() {
    setBreakfast('• 1 bowl of Oatmeal with mixed berries\n• 1 scoop of whey protein (water)\n• 1 cup green tea');
    setLunch('• 150g Grilled chicken breast\n• 100g Quinoa\n• Steamed broccoli & asparagus');
    setDinner('• 150g Baked Atlantic Salmon\n• Sweet potato mash (small portion)\n• Mixed leaf salad with olive oil');
    setSnacks('• 1 apple\n• 1 handful of almonds');
    setHydration('• Drink 3L water daily');
    setExercises([
      { id: 'ex_1', name: 'Straight Leg Raises', sets: 3, reps: 10 },
      { id: 'ex_2', name: 'Wall Slides',         sets: 3, reps: 12 },
      { id: 'ex_3', name: 'Ankle Pumps',         sets: 3, reps: 20 },
    ]);
    setShowChart(true);
    setIsPreviewMode(true); // Must transition to preview even on fallback
  }

  /* ── Enroll & Prescribe: Create Account → Assign ──── */
  async function handleEnroll() {
    setError('');

    // Validate required account fields
    if (!patientName.trim() || !email.trim() || !password.trim()) {
      setError('Name, Email, and Password are required.');
      return;
    }

    /* 
    // Strict Exercise Validation - DISABLED BY USER REQUEST
    const invalidEx = exercises.find(ex => ex.name.trim() !== '' && !allowedExercises.includes(ex.name));
    if (invalidEx) {
      setError(`Invalid exercise: "${invalidEx.name}". Please select from the dropdown suggestions or ensure it's a valid exercise.`);
      return;
    }
    */

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      // Phase 1: Create patient account
      const createRes = await fetch(`${API_URL}/create-insider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_uid: doctorUid,
          patient_name: patientName,
          patient_email: email,
          patient_password: password,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.detail || 'Failed to create account');

      const patientUid = createData.patient_uid;

      // Phase 2: Assign prescription (Full 7-day plan)
      let finalDietJson = {};
      let finalWorkoutJson = {};
  
      if (fullGeneratedPlan) {
        if (fullGeneratedPlan.schema_version === 2) {
          // AI V2 uses .diet (with .days), Deterministic V1+ uses .diet_plan (top-level days)
          finalDietJson = fullGeneratedPlan.diet || fullGeneratedPlan.diet_plan || {};
          
          finalWorkoutJson = { 
            sched: fullGeneratedPlan.sched, 
            tpl: fullGeneratedPlan.tpl 
          };
        } else {
          // V1 Legacy Support
          if (fullGeneratedPlan.diet_plan) {
            finalDietJson = { ...fullGeneratedPlan.diet_plan };
            // Ensure edits from the manual textareas are merged
            finalDietJson.day_1 = [
              { meal_type: 'breakfast', name: breakfast, cal: 0 },
              { meal_type: 'lunch', name: lunch, cal: 0 },
              { meal_type: 'dinner', name: dinner, cal: 0 }
            ];
          }
          if (fullGeneratedPlan.workout_plan) {
            finalWorkoutJson = { ...fullGeneratedPlan.workout_plan };
            finalWorkoutJson.day_1 = {
              exercises: exercises.map(({ name, sets, reps }) => ({ name, sets: +sets, reps: +reps }))
            };
          }
        }
      } else {
        finalDietJson    = { day_1: { breakfast, lunch, dinner } };
        finalWorkoutJson = { day_1: { exercises: exercises.map(({ name, sets, reps }) => ({ name, sets: +sets, reps: +reps })) } };
      }
  
      const hasPrescription = !!fullGeneratedPlan || !!breakfast || !!lunch || !!dinner || exercises.length > 0;

      if (hasPrescription) {
        await fetch(`${API_URL}/assign-prescription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doctor_uid: doctorUid,
            patient_uid: patientUid,
            diet_json:    (planType === 'diet' || planType === 'both') ? finalDietJson    : {},
            workout_json: (planType === 'exercise' || planType === 'both') ? finalWorkoutJson : {},
            notes: `Goal: ${dietGoal} | Med: ${bloodPressure} | Pref: ${foodPreference} | Active: ${activityLevel} | Meals: ${mealsPerDay}`,
          }),
        });
      }

      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
        onSuccess();
        onClose();
      }, 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Chart data ────────────────────────────────────── */
  const chartData = {
    labels: ['Protein', 'Carbs', 'Fats'],
    datasets: [{ data: [40, 35, 25], backgroundColor: ['#2563eb', '#059669', '#f59e0b'], borderWidth: 0, hoverOffset: 4 }],
  };
  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { color: '#64748b', font: { size: 10, weight: 'bold' } } },
      tooltip: { backgroundColor: '#0f172a', titleColor: '#ffffff', bodyColor: '#e2e8f0', borderColor: '#334155', borderWidth: 1 },
    },
    cutout: '70%',
  };

  const showDiet     = planType === 'diet'     || planType === 'both';
  const showExercise = planType === 'exercise' || planType === 'both';

  /* ── Plan-type card active styles ──────────────────── */
  function planActiveStyles(type) {
    const active = planType === type;
    const map = {
      diet:     { bg: '#eff6ff', border: '#2563eb', glow: 'rgba(37,99,235,0.1)',  dot: '#2563eb', inner: '#2563eb', label: '#1e40af', iconBg: '#dbeafe', iconBorder: '#dbeafe', icon: '#2563eb' },
      exercise: { bg: '#fff7ed', border: '#f97316', glow: 'rgba(249,115,22,0.1)',  dot: '#f97316', inner: '#f97316', label: '#9a3412', iconBg: '#ffedd5', iconBorder: '#ffedd5', icon: '#f97316' },
      both:     { bg: '#ecfdf5', border: '#059669', glow: 'rgba(5,150,105,0.1)',  dot: '#059669', inner: '#059669', label: '#065f46', iconBg: '#d1fae5', iconBorder: '#d1fae5', icon: '#059669' },
    };
    const c = map[type];
    if (!active) return {};
    return {
      card:  { background: c.bg, borderColor: c.border, boxShadow: `0 0 15px ${c.glow}` },
      dot:   { borderColor: c.dot },
      inner: { background: c.inner },
      label: { color: c.label },
      icon:  { background: c.iconBg, borderColor: c.iconBorder, color: c.icon },
    };
  }

  const isBasicInfoValid = 
    patientName.trim() !== '' && 
    email.includes('@') && 
    !emailExists && 
    password.length >= 6 &&
    age.trim() !== '' &&
    gender !== '' &&
    weight.trim() !== '' &&
    height.trim() !== '';
  
  const isDietSpecsValid = 
    dietGoal !== '' && 
    foodPreference !== '' && 
    bloodPressure !== '' && 
    (restrictions.length > 0 && restrictions[0] !== '') && 
    activityLevel !== '' && 
    mealsPerDay !== '';

  const isWorkoutSpecsValid =
    workoutGoal !== '' &&
    equipment !== '' &&
    targetAreas.length > 0 &&
    fitnessLevel !== '' &&
    workoutDays !== '' &&
    sessionTime !== '' &&
    injuries.length > 0;

  const isCombinedSpecsValid =
    sharedGoal !== '' &&
    foodPreference !== '' &&
    activityLevel !== '' &&
    mealsPerDay !== '' &&
    equipment !== '' &&
    targetAreas.length > 0 &&
    fitnessLevel !== '' &&
    workoutDays !== '' &&
    sessionTime !== '';

  const isValidToGenerate = () => {
    if (planType === 'diet') return isDietSpecsValid;
    if (planType === 'exercise') return isWorkoutSpecsValid;
    if (planType === 'both') return isCombinedSpecsValid;
    return false;
  };

  /* ══════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════ */
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes fadeIn {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .rx-skeleton-pulse {
          background: #f1f5f9;
          background-image: linear-gradient(
            90deg,
            #f1f5f9 0%,
            #e2e8f0 50%,
            #f1f5f9 100%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite linear;
          border-radius: 8px;
        }
        .rx-active-day {
           border: 2px solid #3b82f6 !important;
           box-shadow: 0 0 15px rgba(59, 130, 246, 0.2) !important;
           transform: scale(1.02);
        }
      `}</style>

      {/* Overlay */}
      <div className="rx-overlay">
        <div className="rx-backdrop-glow" />

        {/* Container */}
        <div className="rx-container">

          {/* ── HEADER ────────────────────────────────────── */}
          <div className="rx-header">
            <div className="rx-header-left">
              <div className="rx-header-icon">🩺</div>
              <div>
                <h1 className="rx-header-title">NutriFit Doctor Portal</h1>
                <p className="rx-header-sub">Enroll Patient & Prescribe Plan</p>
              </div>
            </div>
            <div className="rx-header-right">
              <div className="rx-status-badge">
                <span className="rx-status-dot" />
                System Online
              </div>
              <button className="rx-close-btn" onClick={onClose}>✕</button>
            </div>
          </div>

          {/* ── ERROR BANNER ──────────────────────────────── */}
          {error && (
            <div style={{
              margin: '0 24px', padding: '12px 16px',
              background: 'rgba(127,29,29,0.2)', border: '1px solid rgba(127,29,29,0.4)',
              borderRadius: '12px', color: '#fda4af', fontSize: '13px',
            }}>
              {error}
            </div>
          )}

          {/* ── BODY ──────────────────────────────────────── */}
          <div className="rx-body">
            <div className="rx-grid">

              {/* ─── Column 1 — Patient Info + Account ────── */}
              <div className="rx-col">
                <div className="rx-col-header">
                  <span className="rx-icon-indigo">👤</span>
                  <h2>Patient Details & Account</h2>
                </div>

                <div className="rx-field-group">
                  <label className="rx-label">Full Name <span style={{ color: '#f43f5e' }}>*</span></label>
                  <input 
                    ref={nameRef}
                    autoFocus
                    className="rx-input" 
                    type="text" 
                    placeholder="e.g. Sam Das"
                    value={patientName} 
                    onChange={e => setPatientName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') emailRef.current?.focus(); }}
                  />
                </div>

                <div className="rx-field-group">
                  <label className="rx-label" style={{ color: emailExists ? '#f43f5e' : 'inherit' }}>
                    Email (Gmail) <span style={{ color: '#f43f5e' }}>*</span>
                  </label>
                  <input 
                    ref={emailRef}
                    className="rx-input" 
                    type="email" 
                    placeholder="patient@gmail.com"
                    style={{ 
                      borderColor: emailExists ? '#f43f5e' : 'inherit',
                      boxShadow: emailExists ? '0 0 0 2px rgba(244, 63, 94, 0.1)' : 'none'
                    }}
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                  />
                  {emailExists && (
                    <p style={{
                      color: '#f43f5e', fontSize: '12px', marginTop: '4px', fontStyle: 'italic', fontWeight: 'bold',
                      animation: 'fadeIn 0.3s'
                    }}>
                      ⚠️ Account already exists with this email.
                    </p>
                  )}
                  {emailChecking && (
                    <p style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>Checking Availability...</p>
                  )}
                </div>

                <div className="rx-field-group">
                  <label className="rx-label">Password <span style={{ color: '#f43f5e' }}>*</span></label>
                  <input className="rx-input" type="text" placeholder="Min 6 characters"
                    value={password} onChange={e => setPassword(e.target.value)} />
                </div>

                <div className="rx-row-3">
                  <div className="rx-field-group">
                    <label className="rx-label">Age</label>
                    <input className="rx-input rx-input-center" type="text" placeholder="Years"
                      value={age} onChange={e => setAge(e.target.value)} />
                  </div>
                  <div className="rx-field-group">
                    <label className="rx-label">Gender</label>
                    <div className="rx-select-wrap">
                      <select className="rx-select" value={gender} onChange={e => setGender(e.target.value)}>
                        <option value="" disabled>Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                      <span className="rx-select-chevron">▼</span>
                    </div>
                  </div>
                </div>

                <div className="rx-row-3">
                  <div className="rx-field-group">
                    <label className="rx-label">Weight</label>
                    <input className="rx-input rx-input-center" type="text" placeholder="kg/lbs"
                      value={weight} onChange={e => setWeight(e.target.value)} />
                  </div>
                  <div className="rx-field-group">
                    <label className="rx-label">Height</label>
                    <input className="rx-input rx-input-center" type="text" placeholder="ft/cm"
                      value={height} onChange={e => setHeight(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* ─── Column 2 — Plan Type ────────────────── */}
              <div className={`rx-col ${!isBasicInfoValid ? 'rx-col--locked' : ''}`} style={{ position: 'relative' }}>
                {!isBasicInfoValid && (
                  <div className="rx-step-lock-overlay">
                    <div className="rx-lock-badge">🔒 Step 1 Required</div>
                  </div>
                )}
                <div className="rx-col-header">
                  <span className="rx-icon-emerald">⚡</span>
                  <h2>Assign Plan Type</h2>
                </div>

                <div className="rx-plan-wrapper">
                  {/* Diet Only */}
                  <button className="rx-plan-card" onClick={() => setPlanType('diet')}
                    style={planActiveStyles('diet').card || {}}>
                    <div className="rx-plan-dot" style={planActiveStyles('diet').dot || {}}>
                      {planType === 'diet' && <div className="rx-plan-dot-inner" style={planActiveStyles('diet').inner || {}} />}
                    </div>
                    <div className="rx-plan-content">
                      <div className="rx-plan-icon-wrap" style={planActiveStyles('diet').icon || {}}>🍎</div>
                      <span className="rx-plan-label" style={planActiveStyles('diet').label || {}}>Diet Only</span>
                    </div>
                  </button>

                  {/* Exercise Only */}
                  <button className="rx-plan-card" onClick={() => setPlanType('exercise')}
                    style={planActiveStyles('exercise').card || {}}>
                    <div className="rx-plan-dot" style={planActiveStyles('exercise').dot || {}}>
                      {planType === 'exercise' && <div className="rx-plan-dot-inner" style={planActiveStyles('exercise').inner || {}} />}
                    </div>
                    <div className="rx-plan-content">
                      <div className="rx-plan-icon-wrap" style={planActiveStyles('exercise').icon || {}}>🏋️</div>
                      <span className="rx-plan-label" style={planActiveStyles('exercise').label || {}}>Exercise Only</span>
                    </div>
                  </button>

                  {/* Both */}
                  <button className="rx-plan-card" onClick={() => setPlanType('both')}
                    style={planActiveStyles('both').card || {}}>
                    <div className="rx-plan-dot" style={planActiveStyles('both').dot || {}}>
                      {planType === 'both' && <div className="rx-plan-dot-inner" style={planActiveStyles('both').inner || {}} />}
                    </div>
                    <div className="rx-plan-content">
                      <div className="rx-plan-icon-wrap" style={planActiveStyles('both').icon || {}}>⚡</div>
                      <div>
                        <span className="rx-plan-label" style={planActiveStyles('both').label || {}}>Both Diet & Exercise</span>
                        {planType === 'both' && (
                          <span className="rx-plan-sub" style={{ color: '#10b981' }}>Recommended for max results</span>
                        )}
                      </div>
                    </div>
                    {planType === 'both' && (
                      <span className="rx-plan-check" style={{ color: '#34d399' }}>✅</span>
                    )}
                  </button>
                </div>
              </div>

              {/* ─── Column 3 — Content (Diet + Exercise) ── */}
              <div className={`rx-col rx-col-scroll ${!planType ? 'rx-col--locked' : ''}`} style={{ position: 'relative' }}>
                {!planType && (
                  <div className="rx-step-lock-overlay">
                    <div className="rx-lock-badge">🔒 Step 2 Required</div>
                  </div>
                )}
                
                {/* --- PREVIEW MODE HEADER --- */}
                {isPreviewMode && (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: '15px',
                    background: 'rgba(56, 189, 248, 0.1)',
                    padding: '10px 15px',
                    borderRadius: '12px',
                    border: '1px solid rgba(56, 189, 248, 0.2)'
                  }}>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#0369a1' }}>📋 Plan Draft Created</span>
                    <button 
                      onClick={() => setIsPreviewMode(false)}
                      style={{ 
                        fontSize: '11px', 
                        background: '#fff', 
                        border: '1px solid #0ea5e9', 
                        color: '#0ea5e9',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      ↺ Change Parameters
                    </button>
                  </div>
                )}

                <div className="rx-col-header">
                  <span className="rx-icon-indigo">⚙️</span>
                  <h2>{isPreviewMode ? 'Review & Finalize' : 'Step 3: Define Parameters'}</h2>
                </div>

                {/* --- 7-Day Preview Button (Dynamic) --- */}
                {isPreviewMode && fullGeneratedPlan && (
                  <button 
                    onClick={() => setShowFullPreview(true)}
                    className="rx-full-preview-trigger"
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: 'rgba(56, 189, 248, 0.08)',
                      border: '2px dashed #0369a1',
                      borderRadius: '16px',
                      color: '#0369a1',
                      fontSize: '14px',
                      fontWeight: '800',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      marginBottom: '24px',
                      boxShadow: '0 4px 12px rgba(3, 105, 161, 0.1)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <span style={{ fontSize: '18px' }}>📆</span>
                    <span>VIEW FULL 7-DAY SCHEDULE</span>
                    <span style={{ background: '#0369a1', color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '4px' }}>AI</span>
                  </button>
                )}

                {/* Diet Section */}
                {planType === 'diet' && (
                  <div className="rx-diet-section">
                    
                    {!isPreviewMode ? (
                      /* Phase 1: Diet Specifications Section */
                      <div className="rx-diet-specs" style={{ 
                        background: '#f8fafc', 
                        borderRadius: '20px', 
                        padding: '24px', 
                        marginBottom: '24px',
                        border: '1px solid #e2e8f0'
                      }}>
                        <h4 style={{ fontSize: '17px', color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', fontWeight: '800' }}>
                          <span style={{ marginRight: '10px', fontSize: '20px' }}>🥗</span> Personalized Diet Protocol
                        </h4>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#2563eb', fontSize: '14px', fontWeight: '700' }}>🎯 Primary Goal</label>
                            <div className="rx-select-wrap">
                              <select className="rx-select" style={{ width: '100%' }} value={dietGoal} onChange={e => setDietGoal(e.target.value)}>
                                <option value="" disabled>Select Goal</option>
                                <option value="Weight Loss">Weight Loss</option>
                                <option value="Weight Gain">Weight Gain</option>
                                <option value="Maintain">Maintain</option>
                              </select>
                              <span className="rx-select-chevron">▼</span>
                            </div>
                          </div>

                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#059669' }}>🍎 Food Preference</label>
                            <div className="rx-select-wrap">
                              <select className="rx-select" style={{ width: '100%' }} value={foodPreference} onChange={e => setFoodPreference(e.target.value)}>
                                <option value="" disabled>Select Pref</option>
                                <option value="Veg">Pure Veg</option>
                                <option value="Non-veg">Non-Veg</option>
                                <option value="Eggetarian">Eggetarian</option>
                              </select>
                              <span className="rx-select-chevron">▼</span>
                            </div>
                          </div>

                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#dc2626' }}>🏥 Medical Link</label>
                            <div className="rx-select-wrap">
                              <select className="rx-select" style={{ width: '100%' }} value={bloodPressure} onChange={e => setBloodPressure(e.target.value)}>
                                <option value="" disabled>Select Link</option>
                                <option value="None">No Condition</option>
                                <option value="Diabetes">Diabetic</option>
                                <option value="BP">High BP</option>
                                <option value="Thyroid">Thyroid</option>
                              </select>
                              <span className="rx-select-chevron">▼</span>
                            </div>
                          </div>

                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#d97706' }}>🚫 Restriction</label>
                            <div className="rx-select-wrap">
                              <select className="rx-select" style={{ width: '100%' }} value={restrictions[0]} onChange={e => setRestrictions([e.target.value])}>
                                <option value="" disabled>Select Restriction</option>
                                <option value="None">No Restrictions</option>
                                <option value="No Sugar">Sugar Free</option>
                                <option value="Low Salt">Low Salt</option>
                                <option value="Low Oil">Low Oil</option>
                                <option value="Allergy">Allergy prone</option>
                              </select>
                              <span className="rx-select-chevron">▼</span>
                            </div>
                          </div>

                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#7c3aed' }}>🏃 Activity Level</label>
                            <div className="rx-select-wrap">
                              <select className="rx-select" style={{ width: '100%' }} value={activityLevel} onChange={e => setActivityLevel(e.target.value)}>
                                <option value="" disabled>Select Activity</option>
                                <option value="Sedentary">Sedentary (Office)</option>
                                <option value="Moderate">Moderate (Active)</option>
                                <option value="Active">High Athlete</option>
                              </select>
                              <span className="rx-select-chevron">▼</span>
                            </div>
                          </div>

                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#0891b2' }}>🍴 Meals Count</label>
                            <div className="rx-select-wrap">
                              <select className="rx-select" style={{ width: '100%' }} value={mealsPerDay} onChange={e => setMealsPerDay(e.target.value)}>
                                <option value="" disabled>Select Meals</option>
                                <option value="3">3 Full Meals</option>
                                <option value="4">4 Meals / Day</option>
                                <option value="5">5 Small Meals</option>
                              </select>
                              <span className="rx-select-chevron">▼</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Phase 2: Diet Preview & Edit Section */
                      <div className="rx-diet-preview" style={{ marginBottom: '25px' }}>
                        <div className="rx-meal-edit-group" style={{ marginBottom: '15px' }}>
                          <label style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>🌅 Breakfast</label>
                          <textarea 
                            className="rx-textarea"
                            style={{ width: '100%', minHeight: '80px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', fontSize: '13px' }}
                            value={breakfast}
                            onChange={e => setBreakfast(e.target.value)}
                          />
                        </div>
                        <div className="rx-meal-edit-group" style={{ marginBottom: '15px' }}>
                          <label style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>☀️ Lunch</label>
                          <textarea 
                            className="rx-textarea"
                            style={{ width: '100%', minHeight: '80px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', fontSize: '13px' }}
                            value={lunch}
                            onChange={e => setLunch(e.target.value)}
                          />
                        </div>
                        <div className="rx-meal-edit-group" style={{ marginBottom: '15px' }}>
                          <label style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>🌙 Dinner</label>
                          <textarea 
                            className="rx-textarea"
                            style={{ width: '100%', minHeight: '80px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', fontSize: '13px' }}
                            value={dinner}
                            onChange={e => setDinner(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {/* Generate AI Button (for Diet Only phase) */}
                    {planType === 'diet' && !isPreviewMode && (
                      <button
                        className={`rx-generate-btn ${generating ? 'rx-generate-btn--loading' : ''} ${!isValidToGenerate() ? 'rx-generate-btn--disabled' : ''}`}
                        onClick={generateAI}
                        disabled={generating || !isValidToGenerate()}
                        style={{ marginTop: '10px', width: '100%' }}
                      >
                        {generating ? '⏳' : '✨'}
                        <span>{generating ? 'Analyzing Profile & Generating...' : 'Generate AI Diet Plan'}</span>
                      </button>
                    )}

                    {showChart && (
                      <div className="rx-chart-wrapper" style={{ marginTop: '20px' }}>
                        <p className="rx-chart-title">Target Macro Distribution</p>
                        <div className="rx-chart-canvas">
                          <Doughnut data={chartData} options={chartOptions} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Exercise Section */}
                {planType === 'exercise' && (
                  <div className="rx-exercise-section">
                    {!isPreviewMode ? (
                      /* Phase 1: Exercise Specifications Section */
                      <div className="rx-diet-specs" style={{ 
                        background: '#f8fafc', 
                        borderRadius: '20px', 
                        padding: '24px', 
                        marginBottom: '24px',
                        border: '1px solid #e2e8f0',
                        marginTop: showDiet ? '24px' : '0'
                      }}>
                        <h4 style={{ fontSize: '17px', color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', fontWeight: '800' }}>
                          <span style={{ marginRight: '10px', fontSize: '20px' }}>🏋️</span> Personalized Workout Protocol
                        </h4>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#2563eb', fontSize: '14px', fontWeight: '700' }}>🎯 Main Goal</label>
                            <div className="rx-select-wrap">
                              <select className="rx-select" style={{ width: '100%' }} value={workoutGoal} onChange={e => setWorkoutGoal(e.target.value)}>
                                <option value="" disabled>Select Goal</option>
                                <option value="Build Muscle">Build Muscle</option>
                                <option value="Lose Weight">Lose Weight</option>
                                <option value="Stay Fit">Stay Fit</option>
                                <option value="Flexibility">Flexibility</option>
                              </select>
                              <span className="rx-select-chevron">▼</span>
                            </div>
                          </div>

                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#059669', fontSize: '14px', fontWeight: '700' }}>🏋️ Equipment (Select one)</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
                              <label style={{ fontSize: '15px', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '500' }}>
                                <input type="radio" name="equip" value="No Equipment" checked={equipment === "No Equipment"} onChange={e => setEquipment(e.target.value)} style={{ transform: 'scale(1.2)' }} /> No Equipment
                              </label>
                              <label style={{ fontSize: '15px', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '500' }}>
                                <input type="radio" name="equip" value="Basic Equipment" checked={equipment === "Basic Equipment"} onChange={e => setEquipment(e.target.value)} style={{ transform: 'scale(1.2)' }} /> Basic Equipment
                              </label>
                              <label style={{ fontSize: '15px', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '500' }}>
                                <input type="radio" name="equip" value="Full Gym" checked={equipment === "Full Gym"} onChange={e => setEquipment(e.target.value)} style={{ transform: 'scale(1.2)' }} /> Full Gym
                              </label>
                            </div>
                          </div>
                          
                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#dc2626', fontSize: '14px', fontWeight: '700' }}>⚡ Fitness Level</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
                              <label style={{ fontSize: '15px', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '500' }}>
                                <input type="radio" name="fitLevel" value="Beginner" checked={fitnessLevel === "Beginner"} onChange={e => setFitnessLevel(e.target.value)} style={{ transform: 'scale(1.2)' }} /> Beginner
                              </label>
                              <label style={{ fontSize: '15px', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '500' }}>
                                <input type="radio" name="fitLevel" value="Intermediate" checked={fitnessLevel === "Intermediate"} onChange={e => setFitnessLevel(e.target.value)} style={{ transform: 'scale(1.2)' }} /> Intermediate
                              </label>
                              <label style={{ fontSize: '15px', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '500' }}>
                                <input type="radio" name="fitLevel" value="Advanced" checked={fitnessLevel === "Advanced"} onChange={e => setFitnessLevel(e.target.value)} style={{ transform: 'scale(1.2)' }} /> Advanced
                              </label>
                            </div>
                          </div>

                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#7c3aed', fontSize: '14px', fontWeight: '700' }}>🎯 Target Area</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
                              {['Full Body', 'Chest', 'Back', 'Legs', 'Core', 'Arms'].map(area => (
                                <label key={area} style={{ fontSize: '15px', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '500' }}>
                                  <input type="checkbox" checked={targetAreas.includes(area)} style={{ transform: 'scale(1.2)' }} onChange={e => {
                                    if (e.target.checked) setTargetAreas([...targetAreas, area]);
                                    else setTargetAreas(targetAreas.filter(a => a !== area));
                                  }} /> {area}
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#d97706', fontSize: '14px', fontWeight: '700' }}>🚫 Injury / Limitations</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
                              {['None', 'Knee Pain', 'Back Pain', 'Shoulder Issue', 'Wrist Pain'].map(injury => (
                                <label key={injury} style={{ fontSize: '15px', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '500' }}>
                                  <input type="checkbox" checked={injuries.includes(injury)} style={{ transform: 'scale(1.2)' }} onChange={e => {
                                    if (injury === 'None') {
                                      setInjuries(['None']);
                                    } else {
                                      const filtered = injuries.filter(i => i !== 'None');
                                      if (e.target.checked) setInjuries([...filtered, injury]);
                                      else setInjuries(filtered.filter(i => i !== injury));
                                    }
                                  }} /> {injury}
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#0891b2' }}>📅 Workout Days</label>
                            <div className="rx-select-wrap">
                              <select className="rx-select" style={{ width: '100%' }} value={workoutDays} onChange={e => setWorkoutDays(e.target.value)}>
                                <option value="" disabled>Select Days</option>
                                <option value="3 days/week">3 days/week</option>
                                <option value="4 days/week">4 days/week</option>
                                <option value="5-6 days/week">5–6 days/week</option>
                              </select>
                              <span className="rx-select-chevron">▼</span>
                            </div>
                          </div>

                          <div className="rx-field-group">
                            <label className="rx-label" style={{ color: '#8b5cf6' }}>⏱️ Time Per Session</label>
                            <div className="rx-select-wrap">
                              <select className="rx-select" style={{ width: '100%' }} value={sessionTime} onChange={e => setSessionTime(e.target.value)}>
                                <option value="" disabled>Select Time</option>
                                <option value="10-15 min">10–15 min</option>
                                <option value="20-30 min">20–30 min</option>
                                <option value="45-60 min">45–60 min</option>
                              </select>
                              <span className="rx-select-chevron">▼</span>
                            </div>
                          </div>
                          
                          <div className="rx-field-group" style={{ gridColumn: 'span 2' }}>
                            <label className="rx-label" style={{ color: '#f43f5e', fontSize: '14px', fontWeight: '700' }}>🎚️ Intensity Preference (Optional)</label>
                            <div style={{ display: 'flex', gap: '20px', marginTop: '12px' }}>
                              {['Low', 'Moderate', 'High'].map(lev => (
                                <label key={lev} style={{ fontSize: '15px', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '500' }}>
                                  <input type="radio" name="intensity" value={lev} checked={intensity === lev} style={{ transform: 'scale(1.2)' }} onChange={e => setIntensity(e.target.value)} /> {lev}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rx-exercise-preview-container">
                        <div className="rx-exercise-header">
                          <h3>Workout Routine <span className="rx-icon-emerald-sm">✅</span></h3>
                          <button className="rx-add-exercise" onClick={addExercise}>+ Add Manual</button>
                        </div>

                        <div className="rx-exercise-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                          {exercises.length === 0 ? (
                            <div className="rx-exercise-empty" style={{ padding: '20px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                              No exercises generated yet.
                            </div>
                          ) : (
                            exercises.map(ex => (
                              <div className="rx-exercise-row" key={ex.id} style={{ marginBottom: '10px', background: '#fff', padding: '8px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                <ExerciseAutocompleteInput 
                                  value={ex.name} 
                                  onChange={newName => updateExercise(ex.id, 'name', newName)} 
                                />
                                <div className="rx-exercise-nums" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <div className="rx-exercise-num-group">
                                    <span style={{ fontSize: '9px', fontWeight: '800', color: '#94a3b8' }}>SETS</span>
                                    <input className="rx-exercise-num-input" type="number"
                                      style={{ width: '40px', border: 'none', background: '#f1f5f9', borderRadius: '6px', textAlign: 'center', fontWeight: '700' }}
                                      value={ex.sets} onChange={e => updateExercise(ex.id, 'sets', e.target.value)} />
                                  </div>
                                  <div className="rx-exercise-num-group">
                                    <span style={{ fontSize: '9px', fontWeight: '800', color: '#94a3b8' }}>REPS</span>
                                    <input className="rx-exercise-num-input" type="number"
                                      style={{ width: '40px', border: 'none', background: '#f1f5f9', borderRadius: '6px', textAlign: 'center', fontWeight: '700' }}
                                      value={ex.reps} onChange={e => updateExercise(ex.id, 'reps', e.target.value)} />
                                  </div>
                                  <button className="rx-exercise-remove" onClick={() => removeExercise(ex.id)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Generate AI Button (bottom of section) */}
                    {!isPreviewMode && (
                      <button
                        className={`rx-generate-btn ${generating ? 'rx-generate-btn--loading' : ''} ${!isValidToGenerate() ? 'rx-generate-btn--disabled' : ''}`}
                        onClick={generateAI}
                        disabled={generating || !isValidToGenerate()}
                        style={{ marginTop: '20px', width: '100%' }}
                      >
                        {generating ? '⏳' : '✨'}
                        <span>{generating ? 'Analyzing Profile & Generating...' : 'Generate AI Prescription'}</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Combined Section (Both) */}
                {planType === 'both' && (
                  <div className="rx-combined-section">
                    {!isPreviewMode ? (
                      <div className="rx-combined-specs" style={{ marginTop: '10px' }}>
                        <CollapsibleSection title="Patient Health & Goal" important>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div className="rx-field-group">
                              <label className="rx-label" style={{ fontSize: '14px', fontWeight: '700', color: '#334155' }}>Medical Condition</label>
                              <MultiSelectDropdown 
                                options={['None', 'Diabetes', 'High Blood Pressure', 'Thyroid', 'Heart Condition']} 
                                selected={sharedMedical} 
                                onChange={setSharedMedical} 
                                placeholder="Select Conditions" 
                              />
                            </div>
                            <div className="rx-field-group">
                              <label className="rx-label" style={{ fontSize: '14px', fontWeight: '700', color: '#334155' }}>Injury / Limitation</label>
                              <MultiSelectDropdown 
                                options={['None', 'Knee Pain', 'Back Pain', 'Shoulder Issue', 'Wrist Pain']} 
                                selected={injuries} 
                                onChange={setInjuries} 
                                placeholder="Select Injuries" 
                              />
                            </div>
                            <div className="rx-field-group" style={{ gridColumn: 'span 2' }}>
                              <label className="rx-label" style={{ fontSize: '14px', fontWeight: '700', color: '#1e40af' }}>Primary Goal</label>
                              <div className="rx-select-wrap">
                                <select className="rx-select" style={{ width: '100%' }} value={sharedGoal} onChange={e => setSharedGoal(e.target.value)}>
                                  <option value="" disabled>Select Goal</option>
                                  <option value="Weight Loss">Weight Loss</option>
                                  <option value="Weight Gain">Weight Gain</option>
                                  <option value="Stay Fit">Stay Fit</option>
                                  <option value="Flexibility">Flexibility</option>
                                </select>
                                <span className="rx-select-chevron">▼</span>
                              </div>
                            </div>
                          </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Diet Configuration">
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div className="rx-field-group">
                              <label className="rx-label" style={{ fontSize: '14px', fontWeight: '700', color: '#334155' }}>Food Preference</label>
                              <div className="rx-select-wrap">
                                <select className="rx-select" style={{ width: '100%' }} value={foodPreference} onChange={e => setFoodPreference(e.target.value)}>
                                  <option value="" disabled>Select Pref</option>
                                  <option value="Vegetarian">Vegetarian</option>
                                  <option value="Non-Vegetarian">Non-Vegetarian</option>
                                  <option value="Eggetarian">Eggetarian</option>
                                </select>
                                <span className="rx-select-chevron">▼</span>
                              </div>
                            </div>
                            <div className="rx-field-group">
                              <label className="rx-label" style={{ fontSize: '14px', fontWeight: '700', color: '#334155' }}>Dietary Restrictions</label>
                              <MultiSelectDropdown 
                                options={['No Sugar', 'Low Salt', 'Low Oil', 'No Dairy', 'None']} 
                                selected={restrictions} 
                                onChange={setRestrictions} 
                                placeholder="Select Restrictions" 
                              />
                            </div>
                            <div className="rx-field-group">
                              <label className="rx-label" style={{ fontSize: '14px', fontWeight: '700', color: '#334155' }}>Meals Per Day</label>
                              <div className="rx-select-wrap">
                                <select className="rx-select" style={{ width: '100%' }} value={mealsPerDay} onChange={e => setMealsPerDay(e.target.value)}>
                                  <option value="" disabled>Select Meals</option>
                                  <option value="3 Meals">3 Meals</option>
                                  <option value="4 Meals">4 Meals</option>
                                  <option value="5 Meals">5 Meals</option>
                                </select>
                                <span className="rx-select-chevron">▼</span>
                              </div>
                            </div>
                            <div className="rx-field-group">
                              <label className="rx-label" style={{ fontSize: '14px', fontWeight: '700', color: '#334155' }}>Physical Activity</label>
                              <div className="rx-select-wrap">
                                <select className="rx-select" style={{ width: '100%' }} value={activityLevel} onChange={e => setActivityLevel(e.target.value)}>
                                  <option value="" disabled>Select Activity</option>
                                  <option value="Sedentary">Sedentary</option>
                                  <option value="Moderate">Moderate</option>
                                  <option value="Active">Active</option>
                                </select>
                                <span className="rx-select-chevron">▼</span>
                              </div>
                            </div>
                          </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Workout Configuration">
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div className="rx-field-group" style={{ gridColumn: 'span 2' }}>
                              <label className="rx-label" style={{ fontSize: '14px', fontWeight: '700', color: '#334155' }}>Equipment</label>
                              <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
                                {['No Equipment', 'Basic Equipment', 'Full Gym'].map(eq => (
                                  <label key={eq} style={{ fontSize: '14px', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '500' }}>
                                    <input type="radio" value={eq} checked={equipment === eq} onChange={e => setEquipment(e.target.value)} /> {eq}
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div className="rx-field-group">
                              <label className="rx-label" style={{ fontSize: '14px', fontWeight: '700', color: '#334155' }}>Target Area</label>
                              <MultiSelectDropdown 
                                options={['Full Body', 'Chest', 'Back', 'Legs', 'Core', 'Arms']} 
                                selected={targetAreas} 
                                onChange={setTargetAreas} 
                                placeholder="Select Areas" 
                              />
                            </div>
                            <div className="rx-field-group">
                              <label className="rx-label" style={{ fontSize: '14px', fontWeight: '700', color: '#334155' }}>Workout Days</label>
                              <div className="rx-select-wrap">
                                <select className="rx-select" style={{ width: '100%' }} value={workoutDays} onChange={e => setWorkoutDays(e.target.value)}>
                                  <option value="" disabled>Select Days</option>
                                  <option value="3 days/week">3 days/week</option>
                                  <option value="4 days/week">4 days/week</option>
                                  <option value="5-6 days/week">5–6 days/week</option>
                                </select>
                                <span className="rx-select-chevron">▼</span>
                              </div>
                            </div>
                            <div className="rx-field-group">
                              <label className="rx-label" style={{ fontSize: '14px', fontWeight: '700', color: '#334155' }}>Time Per Session</label>
                              <div className="rx-select-wrap">
                                <select className="rx-select" style={{ width: '100%' }} value={sessionTime} onChange={e => setSessionTime(e.target.value)}>
                                  <option value="" disabled>Select Time</option>
                                  <option value="10-15 min">10–15 min</option>
                                  <option value="20-30 min">20–30 min</option>
                                  <option value="45-60 min">45–60 min</option>
                                </select>
                                <span className="rx-select-chevron">▼</span>
                              </div>
                            </div>
                            <div className="rx-field-group" style={{ gridColumn: 'span 2' }}>
                              <label className="rx-label" style={{ fontSize: '14px', fontWeight: '700', color: '#334155' }}>Fitness Level</label>
                              <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
                                {['Beginner', 'Intermediate', 'Advanced'].map(fl => (
                                  <label key={fl} style={{ fontSize: '14px', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '500' }}>
                                    <input type="radio" value={fl} checked={fitnessLevel === fl} onChange={e => setFitnessLevel(e.target.value)} /> {fl}
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div className="rx-field-group" style={{ gridColumn: 'span 2' }}>
                              <label className="rx-label" style={{ fontSize: '14px', fontWeight: '700', color: '#334155' }}>Intensity Preference (Optional)</label>
                              <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
                                {['Low', 'Moderate', 'High'].map(lev => (
                                  <label key={lev} style={{ fontSize: '14px', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '500' }}>
                                    <input type="radio" value={lev} checked={intensity === lev} onChange={e => setIntensity(e.target.value)} /> {lev}
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CollapsibleSection>

                        <button
                          className={`rx-generate-btn ${generating ? 'rx-generate-btn--loading' : ''} ${!isValidToGenerate() ? 'rx-generate-btn--disabled' : ''}`}
                          onClick={generateAI}
                          disabled={generating || !isValidToGenerate()}
                          style={{ marginTop: '20px', width: '100%' }}
                        >
                          {generating ? '⏳' : '✨'}
                          <span>{generating ? 'Analyzing Profile & Generating Combined Plan...' : 'Generate Combined Plan'}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="rx-combined-preview" style={{ marginTop: '10px' }}>
                        <CollapsibleSection title="Diet Plan Review" defaultOpen={true}>
                          <div className="rx-diet-preview">
                            <div className="rx-meal-edit-group" style={{ marginBottom: '15px' }}>
                              <label style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>Breakfast</label>
                              <textarea 
                                className="rx-textarea"
                                style={{ width: '100%', minHeight: '80px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', fontSize: '13px' }}
                                value={breakfast}
                                onChange={e => setBreakfast(e.target.value)}
                              />
                            </div>
                            <div className="rx-meal-edit-group" style={{ marginBottom: '15px' }}>
                              <label style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>Lunch</label>
                              <textarea 
                                className="rx-textarea"
                                style={{ width: '100%', minHeight: '80px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', fontSize: '13px' }}
                                value={lunch}
                                onChange={e => setLunch(e.target.value)}
                              />
                            </div>
                            <div className="rx-meal-edit-group" style={{ marginBottom: '15px' }}>
                              <label style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>Dinner</label>
                              <textarea 
                                className="rx-textarea"
                                style={{ width: '100%', minHeight: '80px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', fontSize: '13px' }}
                                value={dinner}
                                onChange={e => setDinner(e.target.value)}
                              />
                            </div>
                          </div>
                          {showChart && (
                            <div className="rx-chart-wrapper" style={{ marginTop: '20px' }}>
                              <p className="rx-chart-title">Target Macro Distribution</p>
                              <div className="rx-chart-canvas">
                                <Doughnut data={chartData} options={chartOptions} />
                              </div>
                            </div>
                          )}
                        </CollapsibleSection>

                        <CollapsibleSection title="Workout Plan Review" defaultOpen={true}>
                          <div className="rx-exercise-preview-container">
                            <div className="rx-exercise-header">
                              <h3 style={{ fontSize: '15px', color: '#334155', fontWeight: '700', margin: 0 }}>Workout Routine</h3>
                              <button className="rx-add-exercise" onClick={addExercise} style={{ padding: '6px 12px', background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>+ Add Manual</button>
                            </div>

                            <div className="rx-exercise-list" style={{ maxHeight: '300px', overflowY: 'auto', marginTop: '16px' }}>
                              {exercises.length === 0 ? (
                                <div className="rx-exercise-empty" style={{ padding: '20px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                                  No exercises generated yet.
                                </div>
                              ) : (
                                exercises.map(ex => (
                                  <div className="rx-exercise-row" key={ex.id} style={{ marginBottom: '10px', background: '#fff', padding: '8px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', gap: '10px' }}>
                                    <ExerciseAutocompleteInput 
                                      value={ex.name} 
                                      onChange={newName => updateExercise(ex.id, 'name', newName)} 
                                    />
                                    <div className="rx-exercise-nums" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                      <div className="rx-exercise-num-group">
                                        <span style={{ fontSize: '9px', fontWeight: '800', color: '#94a3b8' }}>SETS</span>
                                        <input className="rx-exercise-num-input" type="number"
                                          style={{ width: '40px', border: 'none', background: '#f1f5f9', borderRadius: '6px', textAlign: 'center', fontWeight: '700' }}
                                          value={ex.sets} onChange={e => updateExercise(ex.id, 'sets', e.target.value)} />
                                      </div>
                                      <div className="rx-exercise-num-group">
                                        <span style={{ fontSize: '9px', fontWeight: '800', color: '#94a3b8' }}>REPS</span>
                                        <input className="rx-exercise-num-input" type="number"
                                          style={{ width: '40px', border: 'none', background: '#f1f5f9', borderRadius: '6px', textAlign: 'center', fontWeight: '700' }}
                                          value={ex.reps} onChange={e => updateExercise(ex.id, 'reps', e.target.value)} />
                                      </div>
                                      <button className="rx-exercise-remove" onClick={() => removeExercise(ex.id)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </CollapsibleSection>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* ── FOOTER ────────────────────────────────────── */}
          <div className="rx-footer">
            <div className="rx-footer-left">
              {/* Plan Duration Removed as per request */}
            </div>

            <button
              className={`rx-approve-btn ${submitting ? 'rx-approve-btn--loading' : ''} ${!isPreviewMode ? 'rx-approve-btn--inactive' : ''}`}
              onClick={handleEnroll}
              disabled={submitting || !isPreviewMode}
              style={{ 
                opacity: !isPreviewMode ? 0.6 : 1,
                cursor: !isPreviewMode ? 'not-allowed' : 'pointer',
                background: !isPreviewMode ? '#94a3b8' : 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)'
              }}
            >
              <span>{submitting ? 'Creating Account & Sending...' : isPreviewMode ? '✨ Approve & Enroll Patient' : '🔒 Preview Required'}</span>
              {submitting ? '⏳' : isPreviewMode ? '✅' : '🛡️'}
            </button>
          </div>

        </div>{/* /rx-container */}
      </div>{/* /rx-overlay */}

      {/* ── 7-Day Full Plan Preview Overlay ───────────────── */}
      {showFullPreview && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000, 
          background: 'rgba(15, 23, 42, 0.9)', 
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)', padding: '20px'
        }}>
          <div style={{
            width: '100%', maxWidth: '1200px', maxHeight: '85vh',
            background: '#fff', borderRadius: '24px', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', position: 'relative',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{
              padding: '24px 32px', borderBottom: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div>
                <h3 style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.02em', fontFamily: "'Inter', sans-serif" }}>
                  {generating ? '✨ AI is Crafting Your Schedule...' : 'Personalized 7-Day Schedule'}
                </h3>
                <p style={{ fontSize: '15px', color: '#64748b', marginTop: '4px', fontFamily: "'Inter', sans-serif" }}>
                  {generating ? 'Analyzing data and mapping optimal training volume...' : 'Full workout rotation generated by AI'}
                </p>
              </div>
              <button 
                onClick={() => setShowFullPreview(false)}
                disabled={generating}
                style={{
                  background: '#fff', border: '1px solid #e2e8f0', width: '40px', height: '40px',
                  borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', cursor: generating ? 'not-allowed' : 'pointer', color: '#64748b',
                  opacity: generating ? 0.5 : 1
                }}>✕</button>
            </div>

            <div style={{ padding: '32px', overflowY: 'auto', flex: 1, background: '#f8fafc' }}>
              
              {/* ── 7-Day Protocol Section ────────── */}
              {(planType === 'exercise' || planType === 'both' || planType === 'diet') && (
                <div style={{ 
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', 
                  gap: '16px' 
                }}>
                  {generating ? (
                    /* Skeleton State: Show 7 pulse cards with staggered delays and varied widths */
                    [...Array(7)].map((_, i) => {
                      const isActive = i === currentLoadingDay;
                      const isDone   = i < currentLoadingDay;
                      const isWait   = i > currentLoadingDay;

                      return (
                        <div key={i} className={isActive ? 'rx-active-day' : ''} style={{
                          background: isDone ? '#fff' : (isActive ? '#fff' : 'rgba(248, 250, 252, 0.5)'), 
                          border: isActive ? '2px solid #3b82f6' : (isDone ? '1.5px solid #22c55e' : '1px solid #e2e8f0'),
                          borderRadius: '12px', padding: '10px', minHeight: '160px',
                          display: 'flex', flexDirection: 'column', gap: '6px',
                          boxShadow: isActive ? '0 10px 25px -5px rgba(59, 130, 246, 0.2)' : '0 4px 6px -1px rgba(0,0,0,0.05)',
                          opacity: isWait ? 0.6 : 1,
                          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                          position: 'relative',
                          marginBottom: '4px'
                        }}>
                          {/* Day & Status Header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: '800', color: isDone ? '#22c55e' : (isActive ? '#3b82f6' : '#94a3b8'), textTransform: 'uppercase' }}>Day {i + 1}</span>
                            {isActive && <span style={{ fontSize: '10px', color: '#3b82f6', fontWeight: '700', animation: 'blink 1s infinite' }}>● ANALYZING...</span>}
                            {isDone && <span style={{ fontSize: '10px', color: '#22c55e', fontWeight: '800' }}>✓ READY</span>}
                            {isWait && i === 6 && currentLoadingDay === 6 && !fullGeneratedPlan && (
                                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '700' }}>● FINALIZING...</span>
                            )}
                          </div>

                          {/* Exercise Skeletons */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                            {[...Array(4)].map((_, j) => (
                              <div key={j} style={{ 
                                padding: '12px', background: isDone ? '#f0fdf4' : '#f8fafc', borderRadius: '12px',
                                border: isDone ? '1px solid #dcfce7' : '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '6px'
                              }}>
                                <div className={isDone ? '' : 'rx-skeleton-pulse'} style={{ height: '12px', width: `${60 + (i+j)%3 * 10}%`, borderRadius: '4px', background: isDone ? '#86efac' : '#e2e8f0' }} />
                                <div className={isDone ? '' : 'rx-skeleton-pulse'} style={{ height: '8px', width: '30%', borderRadius: '3px', background: isDone ? '#bbf7d0' : '#f1f5f9' }} />
                              </div>
                            ))}
                          </div>
                          
                          {isActive && (
                            <div style={{ 
                              position: 'absolute', bottom: '15px', right: '15px',
                              width: '24px', height: '24px', border: '3px solid #f8fafc',
                              borderTopColor: '#3b82f6', borderRadius: '50%',
                              animation: 'spin 0.8s linear infinite'
                            }} />
                          )}
                        </div>
                      );
                    })
                  ) : (
                    /* Final State: Show actual plan */
                    (fullGeneratedPlan?.sched || ['day_1', 'day_2', 'day_3', 'day_4', 'day_5', 'day_6', 'day_7']).map((dayKey, index) => {
                      const dayEntry = fullGeneratedPlan?.schema_version === 2 
                        ? fullGeneratedPlan?.tpl?.[dayKey] 
                        : (fullGeneratedPlan?.workout_plan ? fullGeneratedPlan?.workout_plan?.[dayKey] : null);
                      
                      let isRest = !dayEntry || (dayEntry.ex && dayEntry.ex.length === 0) || dayKey === 'REST';
                      if (planType === 'diet') isRest = false; // Diets don't have workout rest days
                      
                      const exercises = dayEntry?.ex || dayEntry?.exercises || [];

                      // Extract Diet for this specific day
                      const dietDayKey = `day_${index + 1}`;
                      let dayDiet = { breakfast: '', lunch: '', dinner: '', snack: '', hydration: '3-4 Liters of water daily' };

                      const getMealData = (mealsArray, type) => {
                         let found = mealsArray.find(m => {
                            if (typeof m === 'string') return m.startsWith(`${type}:`);
                            return m.meal_type === type;
                         });
                         if (!found) return '';
                         if (typeof found === 'string') {
                            const valStr = found.split(':')[1] || '';
                            return valStr.split('|')[0] || '';
                         }
                         return found.name || found.meal || '';
                      };

                      if (fullGeneratedPlan?.schema_version === 2) {
                         const d = fullGeneratedPlan?.diet?.days?.[dietDayKey] || [];
                         dayDiet.breakfast = getMealData(d, 'breakfast');
                         dayDiet.lunch = getMealData(d, 'lunch');
                         dayDiet.dinner = getMealData(d, 'dinner');
                         dayDiet.snack = getMealData(d, 'snack') || getMealData(d, 'snacks');
                      } else if (fullGeneratedPlan?.diet_plan) {
                         const d = fullGeneratedPlan.diet_plan[dietDayKey] || fullGeneratedPlan.diet_plan[dayKey] || [];
                         if (Array.isArray(d)) {
                            dayDiet.breakfast = getMealData(d, 'breakfast');
                            dayDiet.lunch = getMealData(d, 'lunch');
                            dayDiet.dinner = getMealData(d, 'dinner');
                            dayDiet.snack = getMealData(d, 'snack') || getMealData(d, 'snacks');
                         } else {
                            dayDiet.breakfast = typeof d.breakfast === 'object' ? d.breakfast.meal : (d.breakfast || '');
                            dayDiet.lunch = typeof d.lunch === 'object' ? d.lunch.meal : (d.lunch || '');
                            dayDiet.dinner = typeof d.dinner === 'object' ? d.dinner.meal : (d.dinner || '');
                            dayDiet.snack = typeof d.snacks === 'object' ? d.snacks.meal : (d.snacks || '');
                         }
                         if (d.hydration) dayDiet.hydration = d.hydration;
                      }

                      return (
                        <div key={index} style={{
                          background: isRest ? 'rgba(241, 245, 249, 0.5)' : '#fff',
                          border: isRest ? '2px dashed #cbd5e1' : '1px solid #e2e8f0',
                          borderRadius: '12px', padding: '10px', position: 'relative',
                          boxShadow: isRest ? 'none' : '0 10px 15px -3px rgba(0,0,0,0.1)',
                          transition: 'transform 0.2s',
                          minHeight: '160px',
                          display: 'flex', flexDirection: 'column', gap: '6px'
                        }}>
                          <div style={{ 
                            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', 
                            marginBottom: '4px' 
                          }}>
                            <span style={{ 
                              fontSize: '14px', fontWeight: '900', color: isRest ? '#64748b' : '#2563eb', 
                              textTransform: 'uppercase', letterSpacing: '0.05em',
                              fontFamily: "'Inter', sans-serif"
                            }}>
                              Day {index + 1}
                            </span>
                            {!isRest && !generating && (
                              <button
                                onClick={() => toggleEdit(index)}
                                disabled={editDayIndex === index && editingExIdx !== null}
                                style={{
                                  fontSize: '11px', fontWeight: '700', padding: '4px 10px',
                                  borderRadius: '8px', 
                                  background: (editDayIndex === index && editingExIdx !== null) ? '#e2e8f0' : '#f1f5f9', 
                                  border: '1px solid #e2e8f0',
                                  cursor: (editDayIndex === index && editingExIdx !== null) ? 'not-allowed' : 'pointer', 
                                  transition: 'all 0.2s', 
                                  color: (editDayIndex === index && editingExIdx !== null) ? '#94a3b8' : '#475569',
                                  fontFamily: "'Inter', sans-serif",
                                  opacity: (editDayIndex === index && editingExIdx !== null) ? 0.6 : 1,
                                  pointerEvents: (editDayIndex === index && editingExIdx !== null) ? 'none' : 'auto'
                                }}
                              >
                                {editDayIndex === index ? "Done" : "Edit"}
                              </button>
                            )}
                          </div>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                            
                            {/* Workout Section */}
                            {(planType === 'exercise' || planType === 'both') && (
                              isRest ? (
                                <div style={{ 
                                  padding: '28px 0', 
                                  textAlign: 'center', 
                                  background: '#f8fafc', 
                                  borderRadius: '16px',
                                  border: '1px dashed #cbd5e1',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px'
                                }}>
                                  <span style={{ fontSize: '18px' }}>🛌</span>
                                  <p style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', margin: 0, opacity: 0.8 }}>Rest & Recovery</p>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {exercises.map((ex, i) => {
                                    const isString = typeof ex === 'string';
                                    const name = isString ? ex.split('|')[0] : ex.name;
                                    const sets = isString ? (ex.split('|')[1]?.split('x')[0] || 0) : ex.sets;
                                    const reps = isString ? (ex.split('|')[1]?.split('x')[1] || 0) : ex.reps;
                                    
                                    const isDayEditing = editDayIndex === index;
                                    const isPendingRemoval = isDayEditing && pendingRemovals.includes(i);

                                    return (
                                      <div key={i} style={{ 
                                        padding: '10px 14px', 
                                        background: isPendingRemoval ? '#fef2f2' : '#f8fafc', 
                                        borderRadius: '12px',
                                        border: isPendingRemoval ? '1px dashed #ef4444' : '1px solid #e2e8f0',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '12px',
                                        position: 'relative',
                                        minHeight: '48px',
                                        transition: 'all 0.3s ease'
                                      }}>
                                        {isDayEditing && editingExIdx === i ? (
                                          /* Individual Exercise Edit Mode */
                                          <>
                                            <ExerciseAutocompleteInput 
                                                value={name}
                                                onChange={newName => updateFullPlanExercise(index, i, 'name', newName)} 
                                              />
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                              <input 
                                                type="number" 
                                                value={sets} 
                                                onChange={e => updateFullPlanExercise(index, i, 'sets', e.target.value)}
                                                style={{ 
                                                  width: '32px', border: 'none', background: '#e2e8f0', 
                                                  borderRadius: '5px', textAlign: 'center', fontSize: '12px', 
                                                  fontWeight: '800', color: '#1e293b', padding: '3px 0'
                                                }}
                                              />
                                              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600' }}>×</span>
                                              <input 
                                                type="number" 
                                                value={reps} 
                                                onChange={e => updateFullPlanExercise(index, i, 'reps', e.target.value)}
                                                style={{ 
                                                  width: '32px', border: 'none', background: '#e2e8f0', 
                                                  borderRadius: '5px', textAlign: 'center', fontSize: '12px', 
                                                  fontWeight: '800', color: '#1e293b', padding: '3px 0'
                                                }}
                                              />
                                              <button 
                                                onClick={() => setEditingExIdx(null)}
                                                disabled={!isValidExercise(name)}
                                                style={{ 
                                                  marginLeft: '8px', cursor: isValidExercise(name) ? 'pointer' : 'not-allowed', 
                                                  border: 'none', 
                                                  background: isValidExercise(name) ? '#10b981' : '#94a3b8', 
                                                  color: '#fff', 
                                                  borderRadius: '20px', padding: '4px 10px', fontSize: '10px', fontWeight: '800',
                                                  opacity: isValidExercise(name) ? 1 : 0.6
                                                }}
                                              >
                                                Save
                                              </button>
                                            </div>
                                          </>
                                        ) : (
                                          /* View Mode OR Selection/Remove Mode */
                                          <>
                                            <div style={{ 
                                              fontSize: '13px', fontWeight: '600', color: '#1e293b', 
                                              flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                              fontFamily: "'Inter', sans-serif",
                                              opacity: isPendingRemoval ? 0.2 : (isDayEditing && editingExIdx !== null ? 0.3 : 1)
                                            }}>
                                              {name}
                                            </div>

                                            {isDayEditing ? (
                                              isPendingRemoval ? (
                                                /* Soft-Delete Undo/Confirm View */
                                                <div style={{ 
                                                  position: 'absolute', left: '50%', top: '50%', 
                                                  transform: 'translate(-50%, -50%)',
                                                  display: 'flex', gap: '8px', zIndex: 10
                                                }}>
                                                  <button 
                                                    style={{ 
                                                      background: '#fee2e2', color: '#ef4444', border: 'none',
                                                      padding: '4px 12px', borderRadius: '14px', fontSize: '10px',
                                                      fontWeight: '800', cursor: 'default'
                                                    }}
                                                  >
                                                    🗑️ Slated for Removal
                                                  </button>
                                                  <button 
                                                    onClick={() => setPendingRemovals(prev => prev.filter(idx => idx !== i))}
                                                    style={{ 
                                                      background: '#fff', color: '#64748b', border: '1px solid #e2e8f0',
                                                      padding: '4px 12px', borderRadius: '14px', fontSize: '10px',
                                                      fontWeight: '800', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                                    }}
                                                  >
                                                    Cancel (Undo)
                                                  </button>
                                                </div>
                                              ) : (
                                                /* Selection Mode: Moved Controls to the Right */
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                  {editingExIdx === null && (
                                                    <>
                                                      <button 
                                                        onClick={() => {
                                                          setEditingExIdx(i);
                                                          updateFullPlanExercise(index, i, 'name', '');
                                                        }}
                                                        style={{ 
                                                          background: '#fff', color: '#2563eb', border: '1px solid #dbeafe',
                                                          padding: '4px 10px', borderRadius: '10px', fontSize: '10px',
                                                          fontWeight: '700', cursor: 'pointer'
                                                        }}
                                                      >
                                                        Edit
                                                      </button>
                                                      <button 
                                                        onClick={() => {
                                                          if (!pendingRemovals.includes(i)) {
                                                            setPendingRemovals(prev => [...prev, i]);
                                                          }
                                                        }}
                                                        style={{ 
                                                          background: '#fff', color: '#ef4444', border: '1px solid #fee2e2',
                                                          padding: '4px 10px', borderRadius: '10px', fontSize: '10px',
                                                          fontWeight: '700', cursor: 'pointer'
                                                        }}
                                                      >
                                                        Remove
                                                      </button>
                                                    </>
                                                  )}
                                                  <div style={{ 
                                                    fontSize: '12px', fontWeight: '800', color: '#64748b',
                                                    whiteSpace: 'nowrap', fontFamily: "'Inter', sans-serif",
                                                    opacity: editingExIdx !== null ? 0.3 : 1, marginLeft: '8px'
                                                  }}>
                                                    {sets}×{reps}
                                                  </div>
                                                </div>
                                              )
                                            ) : (
                                              /* Static Content (View Mode) */
                                              <div style={{ 
                                                fontSize: '12px', fontWeight: '800', color: '#64748b',
                                                whiteSpace: 'nowrap', fontFamily: "'Inter', sans-serif"
                                              }}>
                                                {sets}×{reps}
                                              </div>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )
                            )}

                            {/* Diet Section */}
                            {(planType === 'diet' || planType === 'both') && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {[
                                    { k: 'breakfast', label: 'Breakfast', val: dayDiet.breakfast },
                                    { k: 'lunch', label: 'Lunch', val: dayDiet.lunch },
                                    { k: 'snack', label: 'Snacks', val: dayDiet.snack },
                                    { k: 'dinner', label: 'Dinner', val: dayDiet.dinner },
                                    { k: 'hydration', label: 'Hydration', val: dayDiet.hydration }
                                  ].map(mealItem => mealItem.val ? (
                                    <div key={mealItem.k} style={{ 
                                      padding: '8px 12px', 
                                      background: '#f0fdf4', 
                                      borderRadius: '10px', 
                                      border: '1px solid #dcfce7',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      gap: '12px'
                                    }}>
                                      <span style={{ 
                                        fontSize: '13px', 
                                        fontWeight: '600', 
                                        color: '#166534', 
                                        opacity: 0.7,
                                        fontFamily: "'Inter', sans-serif",
                                        whiteSpace: 'nowrap'
                                      }}>
                                        {mealItem.k.charAt(0).toUpperCase() + mealItem.k.slice(1)}
                                      </span>
                                      <textarea 
                                        value={mealItem.val}
                                        onChange={e => updateFullPlanDiet(dietDayKey, mealItem.k, e.target.value)}
                                        style={{ 
                                          width: 'auto', 
                                          flex: 1,
                                          border: 'none', 
                                          background: 'transparent',
                                          fontSize: '14px', 
                                          fontWeight: '800', 
                                          color: '#14532d',
                                          textAlign: 'right',
                                          resize: 'none', 
                                          outline: 'none',
                                          fontFamily: "'Inter', sans-serif",
                                          lineHeight: '1.2'
                                        }}
                                        rows={2}
                                      />
                                    </div>
                                  ) : null)}
                                </div>
                            )}

                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            
            <div style={{ 
              padding: '24px 32px', background: '#fff', borderTop: '1px solid #e2e8f0', 
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
               <div style={{ flex: 1 }}>
                 {!generating && (
                   <p style={{ fontSize: '13px', color: '#64748b', maxWidth: '600px', lineHeight: '1.6' }}>
                     AI Insight: This <b>{workoutGoal || dietGoal}</b> plan is optimized for <b>{fitnessLevel || activityLevel}</b> levels. 
                     Confirm the details and click Approve to finalize enrollment.
                   </p>
                 )}
               </div>
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                 {error && (
                   <p style={{ color: '#ef4444', fontSize: '12px', fontWeight: '700', margin: 0 }}>{error}</p>
                 )}
                 {editDayIndex !== null && (
                   <p style={{ color: '#f59e0b', fontSize: '11px', fontWeight: '700', margin: 0, opacity: 0.9 }}>
                     ⚠️ Please click "Done" in the schedule before approving.
                   </p>
                 )}
                 {!generating && (
                   <button 
                     onClick={handleEnroll}
                     disabled={submitting}
                     style={{
                       background: submitting ? '#9ca3af' : '#10b981', 
                       color: '#fff', border: 'none',
                       padding: '14px 28px', borderRadius: '14px', fontSize: '15px',
                       fontWeight: '800', cursor: submitting ? 'not-allowed' : 'pointer', 
                       transition: 'all 0.2s',
                       boxShadow: submitting ? 'none' : '0 10px 15px -3px rgba(16, 185, 129, 0.3)',
                       display: 'flex', alignItems: 'center', gap: '8px',
                       opacity: submitting ? 0.7 : 1
                     }}
                     onMouseEnter={e => { if(!submitting) e.target.style.transform = 'translateY(-2px)'; }}
                     onMouseLeave={e => { if(!submitting) e.target.style.transform = 'translateY(0)'; }}
                   >
                     {submitting ? (
                        <>
                          <div style={{ 
                            width: '16px', height: '16px', border: '2px solid #fff', 
                            borderTopColor: 'transparent', borderRadius: '50%', 
                            animation: 'spin 0.6s linear infinite' 
                          }} />
                          Enrolling Patient...
                        </>
                     ) : (
                        <>Approve & Enroll Patient →</>
                     )}
                   </button>
                 )}
               </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ──────────────────────────────────────── */}
      <div className={`rx-toast ${showToast ? 'rx-toast--visible' : ''}`}>
        <div className="rx-toast-icon">✅</div>
        <div>
          <p className="rx-toast-title">Patient Enrolled & Prescription Sent!</p>
          <p className="rx-toast-sub">Account created and plan assigned successfully.</p>
        </div>
      </div>
    </>
  );
}
