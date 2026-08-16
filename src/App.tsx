import { useCallback, useEffect, useRef, useState } from 'react'
import { Crosshair } from 'lucide-react'
import { AppHeader } from './components/AppHeader'
import { LevelTabs } from './components/LevelTabs'
import { HeadVariantTabs } from './components/HeadVariantTabs'
import { StatusPanel } from './components/StatusPanel'
import { TargetView } from './components/TargetView'
import { AcrylicView } from './components/AcrylicView'
import { MirrorPanel } from './components/MirrorPanel'
import { ScrewAdjustPanel } from './components/ScrewAdjustPanel'
import { ResetPanel } from './components/ResetPanel'
import { Footer } from './components/Footer'
import { HelpDialog } from './components/HelpDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { StraightProcedurePanel } from './components/StraightProcedurePanel'
import { GantryDiagram } from './components/gantry/GantryDiagram'
import { GantryJogPad } from './components/gantry/GantryJogPad'
import { GantryMachineControls } from './components/gantry/GantryMachineControls'
import { GantryLessonPanel } from './components/gantry/GantryLessonPanel'
import { LockedNotice } from './components/LockedNotice'
import { canAccessLevel } from './lib/access'
import { useAuth } from './lib/auth'
import { useAlignmentSim } from './hooks/useAlignmentSim'
import { useStraightProcedure } from './hooks/useStraightProcedure'
import { useGantryLesson } from './hooks/useGantryLesson'
import { useMediaQuery } from './hooks/useMediaQuery'
import { alignmentStatusOf, distance, formatSigned } from './lib/sim'

export const App = () => {
  const {
    level,
    levelId,
    setLevelId,
    headVariant,
    setHeadVariant,
    position,
    history,
    alignmentStatus,
    activeScrew,
    activeDirection,
    movementStep,
    showTrail,
    animationsEnabled,
    motionEnabled,
    prefersReducedMotion,
    moveBeam,
    resetAlignment,
    setMovementStep,
    setShowTrail,
    setAnimationsEnabled,
  } = useAlignmentSim()
  const straight = useStraightProcedure(
    level.kind === 'straight' ? (level.straightAxis ?? 'y') : 'y',
  )
  const gantry = useGantryLesson()
  const [helpOpen, setHelpOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const helpButtonRef = useRef<HTMLButtonElement | null>(null)
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null)
  const compact = !useMediaQuery('(min-width: 640px)', true)
  const { paid } = useAuth()

  const openHelp = useCallback(() => setHelpOpen(true), [])
  const closeHelp = useCallback(() => setHelpOpen(false), [])
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  const isStraight = level.kind === 'straight'
  const isGantry = level.kind === 'gantry'
  const centreLevel = level.kind === 'gantry' ? null : level
  const { restart: restartStraight } = straight
  const { restart: restartGantry } = gantry

  useEffect(() => {
    restartStraight()
    restartGantry()
  }, [levelId, restartStraight, restartGantry])

  const resetStraightLevel = useCallback(() => {
    resetAlignment()
    restartStraight()
  }, [resetAlignment, restartStraight])

  const performStraightAction = useCallback(() => {
    straight.performStep(position)
  }, [straight, position])

  const referenceShot = straight.shots.find((shot) => shot.isReference) ?? null
  const latestShot =
    straight.shots.length > 0 ? straight.shots[straight.shots.length - 1] : null
  const separation =
    referenceShot && latestShot && latestShot.id !== referenceShot.id
      ? { x: latestShot.x - referenceShot.x, y: latestShot.y - referenceShot.y }
      : null
  const separationMm = separation ? distance(separation) : null
  const straightStatus = separation ? alignmentStatusOf(separation) : 'unaligned'
  const displayStatus = isStraight ? straightStatus : alignmentStatus
  const srText = isStraight
    ? separationMm === null
      ? `Belum ada tembakan pada ${straight.variant.axisLabel} sama dengan ${straight.variant.farValue}.`
      : `Sesaran tembakan terakhir ${separationMm.toFixed(1)} milimeter daripada tanda rujukan.`
    : `Posisi beam X ${formatSigned(position.x)}, Y ${formatSigned(position.y)}.`
  const adjustHint = `Laras skru pada ${straight.variant.adjustMirror}, kemudian tembak semula sehingga kesan bertindih.`
  const helperText = isStraight
    ? adjustHint
    : 'Laraskan skru di bawah untuk menggerakkan beam ke tengah sasaran.'

  // Level 2-5 hanya untuk pengguna Akses Penuh.
  if (!canAccessLevel(levelId, paid)) {
    return (
      <div className="flex min-h-screen flex-col bg-canvas">
        <AppHeader
          onOpenHelp={openHelp}
          onOpenSettings={openSettings}
          helpButtonRef={helpButtonRef}
          settingsButtonRef={settingsButtonRef}
        />
        <LevelTabs levelId={levelId} onChange={setLevelId} />
        <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-4 px-4 py-8">
          <LockedNotice what={`${level.tabLabel} dibuka`} />
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <AppHeader
        onOpenHelp={openHelp}
        onOpenSettings={openSettings}
        helpButtonRef={helpButtonRef}
        settingsButtonRef={settingsButtonRef}
      />
      <LevelTabs levelId={levelId} onChange={setLevelId} />
      {levelId === 'level2' ? (
        <HeadVariantTabs variant={headVariant} onChange={setHeadVariant} />
      ) : null}
      <main className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6 lg:grid lg:grid-cols-[minmax(0,40fr)_minmax(0,60fr)] lg:content-start">
        {isGantry ? (
          <section
            className="card flex flex-col gap-3 p-4 sm:p-5 lg:col-start-1 lg:row-start-1"
            aria-labelledby="gantry-control-heading"
          >
            <div>
              <h2
                id="gantry-control-heading"
                className="text-base font-bold text-ink sm:text-lg"
              >
                Kawalan Gantry
              </h2>
              <p className="mt-0.5 text-xs text-muted sm:text-sm">
                Tekan butang anak panah untuk menggerakkan gantry dan head.
              </p>
            </div>
            {/* Pad JOG di kiri, butang mesin bertindan di kanan — kad ini
                kekal pendek supaya rajah di bawahnya terus kelihatan. */}
            <div className="flex items-center gap-3 sm:gap-4">
              <GantryJogPad
                position={gantry.position}
                onJog={gantry.jog}
                className="shrink-0"
              />
              <GantryMachineControls
                busy={gantry.busy}
                onOrigin={gantry.goOrigin}
                onTestLaser={gantry.testLaser}
                className="min-w-0 flex-1"
              />
            </div>
          </section>
        ) : (
          centreLevel && (
            <MirrorPanel
              key={`ref-${levelId}-${headVariant}`}
              level={centreLevel}
              activeScrew={activeScrew}
              activeDirection={activeDirection}
              compact={compact}
              onInfo={openHelp}
              className="lg:col-start-1 lg:row-start-2"
            />
          )
        )}
        <div className="sticky top-0 z-30 -mx-3 bg-canvas px-3 py-2 sm:-mx-6 sm:px-6 lg:static lg:z-auto lg:col-start-2 lg:row-start-1 lg:mx-0 lg:p-0">
          <section className="card p-3 sm:p-5" aria-labelledby="beam-target-heading">
            <h2
              id="beam-target-heading"
              className="mb-2 flex items-center gap-2 text-sm font-bold text-ink sm:mb-3 sm:text-lg"
            >
              <Crosshair
                className="h-4 w-4 text-muted sm:h-5 sm:w-5"
                aria-hidden="true"
              />
              {level.targetHeading}
            </h2>
            {isGantry ? (
              <GantryDiagram
                x={gantry.position.x}
                y={gantry.position.y}
                highlightM1M2={gantry.highlightM1M2}
                targetPoint={gantry.targetPoint}
                motionEnabled={motionEnabled}
                beamPhase={gantry.beamPhase}
                marks={gantry.marks}
                className="mx-auto max-w-[560px]"
              />
            ) : (
              <div className="flex flex-col gap-3 sm:gap-4 xl:flex-row xl:items-start">
                <StatusPanel
                  alignmentStatus={displayStatus}
                  labels={level.statusLabels}
                  successMessage={level.successMessage}
                  srText={srText}
                  helperText={helperText}
                  className="rounded-xl border border-line bg-canvas/50 p-2.5 sm:p-4 xl:order-2 xl:w-64 xl:shrink-0"
                />
                {isStraight ? (
                  <div className="flex flex-1 flex-row items-center justify-center gap-3 sm:gap-4 xl:order-1">
                    <AcrylicView
                      shots={straight.shots}
                      reference={straight.reference}
                      acrylicApplied={straight.acrylicApplied}
                      machineAxisLabel={straight.variant.axisLabel}
                      machineValue={straight.machineValue}
                      motionEnabled={motionEnabled}
                      className="max-w-[min(46%,32svh)] flex-1 sm:max-w-[300px] xl:max-w-[280px]"
                    />
                    <div className="w-full max-w-[46%] min-w-0 sm:max-w-[250px]">
                      <p className="mb-1 text-center text-xs font-semibold text-muted">
                        Kedudukan mesin · {straight.variant.axisLabel} ={' '}
                        {straight.machineValue}
                      </p>
                      {straight.variant.axisLabel === 'X' ? (
                        <GantryDiagram
                          compact
                          x={straight.machineValue}
                          y={90}
                          highlightM2Head
                          motionEnabled={motionEnabled}
                        />
                      ) : (
                        <GantryDiagram
                          compact
                          x={65}
                          y={straight.machineValue}
                          highlightM1M2
                          motionEnabled={motionEnabled}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <TargetView
                    position={position}
                    history={history}
                    showTrail={showTrail}
                    alignmentStatus={alignmentStatus}
                    motionEnabled={motionEnabled}
                    className="mx-auto max-w-[min(70%,30svh)] flex-1 lg:max-w-[434px] xl:order-1 xl:max-w-[355px]"
                  />
                )}
              </div>
            )}
          </section>
        </div>
        {isGantry ? (
          <GantryLessonPanel
            steps={gantry.steps}
            stepIndex={gantry.stepIndex}
            step={gantry.step}
            finished={gantry.finished}
            successMessage={level.successMessage}
            onAdvance={gantry.advance}
            onRestart={gantry.restart}
            className="lg:col-start-2 lg:row-start-2 lg:max-w-[380px] lg:self-start"
          />
        ) : null}
        {isStraight ? (
          <StraightProcedurePanel
            steps={straight.steps}
            stepIndex={straight.stepIndex}
            step={straight.step}
            shotCount={straight.shots.length}
            separationMm={separationMm}
            onAction={performStraightAction}
            onRestart={resetStraightLevel}
            className="lg:col-start-2 lg:row-start-2 lg:max-w-[380px] lg:self-start"
          />
        ) : null}
        {centreLevel && (
          <ScrewAdjustPanel
            key={`adjust-${levelId}-${headVariant}`}
            level={centreLevel}
            activeScrew={activeScrew}
            activeDirection={activeDirection}
            compact={compact}
            onMove={moveBeam}
            disabled={isStraight && !straight.canAdjust}
            hint={
              isStraight
                ? straight.canAdjust
                  ? adjustHint
                  : 'Skru dikunci sehingga anda sampai ke langkah melaras dalam prosedur.'
                : undefined
            }
            className="lg:col-start-1 lg:row-start-1"
          />
        )}
        {isStraight || isGantry ? null : (
          <ResetPanel
            onReset={resetAlignment}
            className="lg:col-start-2 lg:row-start-2 lg:max-w-[380px] lg:self-start"
          />
        )}
        <Footer className="lg:col-span-2 lg:row-start-3" />
      </main>
      <HelpDialog
        open={helpOpen}
        onClose={closeHelp}
        returnFocusRef={helpButtonRef}
        level={level}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={closeSettings}
        returnFocusRef={settingsButtonRef}
        movementStep={movementStep}
        onMovementStepChange={setMovementStep}
        showTrail={showTrail}
        onShowTrailChange={setShowTrail}
        animationsEnabled={animationsEnabled}
        onAnimationsEnabledChange={setAnimationsEnabled}
        prefersReducedMotion={prefersReducedMotion}
        onReset={
          isGantry ? restartGantry : isStraight ? resetStraightLevel : resetAlignment
        }
      />
    </div>
  )
}
