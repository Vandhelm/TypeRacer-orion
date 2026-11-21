-- SALLE-09 : l'écran des résultats, pendant lequel on peut rejoindre le salon (pas pendant la course).
ALTER TYPE "public"."room_status" ADD VALUE 'results' BEFORE 'closed';
