import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import isEqual from 'lodash/isEqual';
import { Vector3, Box3 } from 'three';

import { EPSILON } from '../../constants';
import i18n from '../../lib/i18n';
import ProgressBar from '../../components/ProgressBar';
import ContextMenu from '../../components/ContextMenu';
import Canvas from '../../components/SMCanvas';
import SecondaryToolbar from '../CanvasToolbar/SecondaryToolbar';
import { actions as printingActions, PRINTING_STAGE } from '../../flux/printing';
import VisualizerTopLeft from './VisualizerTopLeft';
import VisualizerModelTransformation from './VisualizerModelTransformation';
import VisualizerCameraOperations from './VisualizerCameraOperations';
import VisualizerPreviewControl from './VisualizerPreviewControl';
import VisualizerInfo from './VisualizerInfo';
import PrintableCube from './PrintableCube';
import styles from './styles.styl';

class Visualizer extends PureComponent {
    static propTypes = {
        size: PropTypes.object.isRequired,
        stage: PropTypes.number.isRequired,
        selectedModelIDArray: PropTypes.array,
        modelGroup: PropTypes.object.isRequired,
        hasModel: PropTypes.bool.isRequired,
        gcodeLineGroup: PropTypes.object.isRequired,
        transformMode: PropTypes.string.isRequired,
        progress: PropTypes.number.isRequired,
        displayedType: PropTypes.string.isRequired,
        renderingTimestamp: PropTypes.number.isRequired,

        selectMultiModel: PropTypes.func.isRequired,
        removeSelectedModel: PropTypes.func.isRequired,
        removeAllModels: PropTypes.func.isRequired,
        arrangeAllModels: PropTypes.func.isRequired,
        onModelTransform: PropTypes.func.isRequired,
        onModelAfterTransform: PropTypes.func.isRequired,
        updateSelectedModelTransformation: PropTypes.func.isRequired,
        duplicateSelectedModel: PropTypes.func.isRequired,
        layFlatSelectedModel: PropTypes.func.isRequired
    };


    printableArea = null;

    contextMenuRef = React.createRef();

    visualizerRef = React.createRef();

    canvas = React.createRef();

    actions = {
        // canvas
        zoomIn: () => {
            this.canvas.current.zoomIn();
        },
        zoomOut: () => {
            this.canvas.current.zoomOut();
        },
        autoFocus: () => {
            this.canvas.current.autoFocus();
        },
        toLeft: () => {
            this.canvas.current.toLeft();
        },
        toRight: () => {
            this.canvas.current.toRight();
        },
        toTop: () => {
            this.canvas.current.toTop();
        },
        toBottom: () => {
            this.canvas.current.toBottom();
        },
        onSelectModels: (intersect, selectEvent) => {
            this.props.selectMultiModel(intersect, selectEvent);
        },
        onModelAfterTransform: () => {
            this.props.onModelAfterTransform();
        },
        onModelTransform: () => {
            this.props.onModelTransform();
        },
        // context menu
        centerSelectedModel: () => {
            this.props.updateSelectedModelTransformation({ positionX: 0, positionY: 0 });
            this.actions.updateBoundingBox();
            this.props.onModelAfterTransform();
        },
        deleteSelectedModel: () => {
            this.props.removeSelectedModel();
        },
        duplicateSelectedModel: () => {
            this.props.duplicateSelectedModel();
        },
        resetSelectedModelTransformation: () => {
            this.props.updateSelectedModelTransformation({
                scaleX: 1,
                scaleY: 1,
                scaleZ: 1,
                rotationX: 0,
                rotationY: 0,
                rotationZ: 0
            });
            this.props.onModelAfterTransform();
        },
        clearBuildPlate: () => {
            this.props.removeAllModels();
        },
        arrangeAllModels: () => {
            this.props.arrangeAllModels();
        },
        layFlatSelectedModel: () => {
            this.props.layFlatSelectedModel();
        },
        updateBoundingBox: () => {
            this.canvas.current.controls.updateBoundingBox();
        },
        startSupportMode: () => {
            this.canvas.current.controls.startSupportMode();
        },
        clearSelectedSupport: () => {
            const { modelGroup } = this.props;
            const isSupportSelected = modelGroup.selectedModelArray.length === 1 && modelGroup.selectedModelArray[0].supportTag === true;
            if (isSupportSelected) {
                modelGroup.removeSelectedModel();
            }
        },
        clearAllManualSupport: () => {
            this.props.modelGroup.removeAllManualSupport();
        }
    };

    constructor(props) {
        super(props);
        const size = props.size;
        this.printableArea = new PrintableCube(size);
    }

    // hideContextMenu = () => {
    //     ContextMenu.hide();
    // };

    componentDidMount() {
        this.canvas.current.resizeWindow();
        this.canvas.current.enable3D();
        window.addEventListener(
            'hashchange',
            (event) => {
                if (event.newURL.endsWith('3dp')) {
                    this.canvas.current.resizeWindow();
                }
            },
            false
        );
    }

    componentWillReceiveProps(nextProps) {
        const { size, transformMode, selectedModelIDArray, renderingTimestamp, modelGroup } = nextProps;
        if (transformMode !== this.props.transformMode) {
            this.canvas.current.setTransformMode(transformMode);
        }
        if (selectedModelIDArray !== this.props.selectedModelIDArray) {
            // selectedModelIDArray.forEach((modelID) => {
            //     const model = modelGroup.models.find(d => d.modelID === modelID);
            //     modelGroup.selectedGroup.add(model.meshObject);
            // });
            this.canvas.current.controls.updateBoundingBox();
            this.canvas.current.controls.attach(modelGroup.selectedGroup);
        }

        if (!isEqual(size, this.props.size)) {
            this.printableArea.updateSize(size);
            const { gcodeLineGroup } = this.props;

            modelGroup.updateBoundingBox(new Box3(
                new Vector3(-size.x / 2 - EPSILON, -size.y / 2 - EPSILON, -EPSILON),
                new Vector3(size.x / 2 + EPSILON, size.y / 2 + EPSILON, size.z + EPSILON)
            ));

            // Re-position model group
            gcodeLineGroup.position.set(-size.x / 2, -size.y / 2, 0);
            this.canvas.current.setCamera(new Vector3(0, -Math.max(size.x, size.y, size.z) * 2, size.z / 2), new Vector3(0, 0, size.z / 2));
        }
        if (renderingTimestamp !== this.props.renderingTimestamp) {
            this.canvas.current.renderScene();
        }
    }

    getNotice() {
        const { stage, progress } = this.props;
        switch (stage) {
            case PRINTING_STAGE.EMPTY:
                return '';
            case PRINTING_STAGE.LOADING_MODEL:
                return i18n._('Loading model...');
            case PRINTING_STAGE.LOAD_MODEL_SUCCEED:
                return i18n._('Loaded model successfully.');
            case PRINTING_STAGE.LOAD_MODEL_FAILED:
                return i18n._('Failed to load model.');
            case PRINTING_STAGE.SLICE_PREPARING:
                return i18n._('Preparing for slicing...');
            case PRINTING_STAGE.SLICING:
                return i18n._('Slicing...{{progress}}%', { progress: (100.0 * progress).toFixed(1) });
            case PRINTING_STAGE.SLICE_SUCCEED:
                return i18n._('Sliced model successfully.');
            case PRINTING_STAGE.SLICE_FAILED:
                return i18n._('Failed to slice model.');
            case PRINTING_STAGE.PREVIEWING:
                return i18n._('Previewing G-code...{{progress}}%', { progress: (100.0 * progress).toFixed(1) });
            case PRINTING_STAGE.PREVIEW_SUCCEED:
                return i18n._('Previewed G-code successfully.');
            case PRINTING_STAGE.PREVIEW_FAILED:
                return i18n._('Failed to load G-code.');
            default:
                return '';
        }
    }

    showContextMenu = (event) => {
        this.contextMenuRef.current.show(event);
    };

    render() {
        const { size, hasModel, selectedModelIDArray, modelGroup, gcodeLineGroup, progress, displayedType } = this.props;

        // const actions = this.actions;

        const isModelSelected = (selectedModelIDArray.length > 0);
        const isSupportSelected = modelGroup.selectedModelArray.length === 1 && modelGroup.selectedModelArray[0].supportTag === true;
        const isModelDisplayed = (displayedType === 'model');
        const notice = this.getNotice();
        let isSupporting = false;
        if (this.canvas.current && this.canvas.current.controls.state === 4) {
            isSupporting = true;
        }
        return (
            <div
                className={styles.visualizer}
                ref={this.visualizerRef}
            >
                <div className={styles['visualizer-top-left']}>
                    <VisualizerTopLeft />
                </div>

                <div className={styles['visualizer-model-transformation']}>
                    <VisualizerModelTransformation
                        updateBoundingBox={this.actions.updateBoundingBox}
                        getControls={() => this.canvas.current && this.canvas.current.controls}
                        isSupporting={isSupporting}
                        clearAllManualSupport={this.actions.clearAllManualSupport}
                    />
                </div>

                <div className={styles['visualizer-camera-operations']}>
                    <VisualizerCameraOperations actions={this.actions} />
                </div>

                <div className={styles['visualizer-preview-control']}>
                    <VisualizerPreviewControl />
                </div>

                <div className={styles['visualizer-info']}>
                    <VisualizerInfo />
                </div>

                <div className={styles['visualizer-progress']}>
                    <ProgressBar tips={notice} progress={progress * 100} />
                </div>

                <div className={styles['canvas-content']} style={{ top: 0 }}>
                    <Canvas
                        ref={this.canvas}
                        size={size}
                        modelGroup={modelGroup}
                        printableArea={this.printableArea}
                        cameraInitialPosition={new Vector3(0, -Math.max(size.x, size.y, size.z) * 2, size.z / 2)}
                        cameraInitialTarget={new Vector3(0, 0, size.z / 2)}
                        cameraUp={new Vector3(0, 0, 1)}
                        gcodeLineGroup={gcodeLineGroup}
                        onSelectModels={this.actions.onSelectModels}
                        onModelAfterTransform={this.actions.onModelAfterTransform}
                        onModelTransform={this.actions.onModelTransform}
                        showContextMenu={this.showContextMenu}
                    />
                </div>
                <div className={styles['canvas-footer']}>
                    <SecondaryToolbar
                        zoomIn={this.actions.zoomIn}
                        zoomOut={this.actions.zoomOut}
                        autoFocus={this.actions.autoFocus}
                    />
                </div>
                <ContextMenu
                    ref={this.contextMenuRef}
                    id="3dp"
                    menuItems={
                        [
                            {
                                type: 'item',
                                label: i18n._('Center Selected Model'),
                                disabled: !isModelSelected,
                                onClick: this.actions.centerSelectedModel
                            },
                            {
                                type: 'item',
                                label: i18n._('Delete Selected Model'),
                                disabled: !isModelSelected,
                                onClick: this.actions.deleteSelectedModel
                            },
                            {
                                type: 'item',
                                label: i18n._('Duplicate Selected Model'),
                                disabled: !isModelSelected,
                                onClick: this.actions.duplicateSelectedModel
                            },
                            {
                                type: 'item',
                                label: i18n._('Reset Selected Model Transformation'),
                                disabled: !isModelSelected,
                                onClick: this.actions.resetSelectedModelTransformation
                            },
                            {
                                type: 'item',
                                label: i18n._('Lay Flat Selected Model'),
                                disabled: !isModelSelected,
                                onClick: this.actions.layFlatSelectedModel
                            },
                            {
                                type: 'separator'
                            },
                            {
                                type: 'item',
                                label: i18n._('Add Manual Support'),
                                disabled: !isModelSelected || isSupportSelected,
                                onClick: this.actions.startSupportMode
                            },
                            {
                                type: 'item',
                                label: i18n._('Delete Selected Support'),
                                disabled: !isSupportSelected,
                                onClick: this.actions.clearSelectedSupport
                            },
                            {
                                type: 'item',
                                label: i18n._('Clear All Manual Support'),
                                disabled: false,
                                onClick: this.actions.clearAllManualSupport
                            },
                            {
                                type: 'separator'
                            },
                            {
                                type: 'item',
                                label: i18n._('Clear Heated Bed'),
                                disabled: !hasModel || !isModelDisplayed,
                                onClick: this.actions.clearBuildPlate
                            },
                            {
                                type: 'item',
                                label: i18n._('Arrange All Models'),
                                disabled: !hasModel || !isModelDisplayed,
                                onClick: this.actions.arrangeAllModels
                            }
                        ]
                    }
                />
            </div>
        );
    }
}

const mapStateToProps = (state) => {
    const machine = state.machine;
    const printing = state.printing;
    const { size } = machine;
    // TODO: be to organized
    const { stage, modelGroup, hasModel, gcodeLineGroup, transformMode, progress, displayedType, renderingTimestamp } = printing;

    return {
        stage,
        size,
        allModel: modelGroup.models,
        selectedModelIDArray: modelGroup.selectedModelIDArray,
        modelGroup,
        hasModel,
        gcodeLineGroup,
        transformMode,
        progress,
        displayedType,
        renderingTimestamp
    };
};

const mapDispatchToProps = (dispatch) => ({
    selectMultiModel: (intersect, selectEvent) => dispatch(printingActions.selectMultiModel(intersect, selectEvent)),
    removeSelectedModel: () => dispatch(printingActions.removeSelectedModel()),
    removeAllModels: () => dispatch(printingActions.removeAllModels()),
    arrangeAllModels: () => dispatch(printingActions.arrangeAllModels()),
    onModelTransform: () => dispatch(printingActions.onModelTransform()),
    onModelAfterTransform: () => dispatch(printingActions.onModelAfterTransform()),
    updateSelectedModelTransformation: (transformation) => dispatch(printingActions.updateSelectedModelTransformation(transformation)),
    duplicateSelectedModel: () => dispatch(printingActions.duplicateSelectedModel()),
    layFlatSelectedModel: () => dispatch(printingActions.layFlatSelectedModel()),
    addSupport: () => dispatch(printingActions.addSupport())
});

export default connect(mapStateToProps, mapDispatchToProps)(Visualizer);
