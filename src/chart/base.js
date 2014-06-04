/**
 * echarts图表基类
 *
 * @desc echarts基于Canvas，纯Javascript图表库，提供直观，生动，可交互，可个性化定制的数据统计图表。
 * @author Kener (@Kener-林峰, linzhifeng@baidu.com)
 *
 */
define(function (require) {
    // 图形依赖
    var ImageShape = require('zrender/shape/Image');
    var IconShape = require('../util/shape/Icon');
    var MarkLineShape = require('../util/shape/MarkLine');
    var SymbolShape = require('../util/shape/Symbol');
    
    var ecConfig = require('../config');
    var ecData = require('../util/ecData');
    var accMath = require('../util/accMath');
    var zrUtil = require('zrender/tool/util');
    var zrArea = require('zrender/tool/area');
    
    var animationBase = require('./animationBase');
    var effectBase = require('./effectBase');
    
    var EFFECT_ZLEVEL = 7;
    
    function Base(){
        var self = this;
        this.selectedMap = {};
        this.shapeHandler = {
            onclick : function () {
                self.isClick = true;
            },
            
            ondragover : function (param) {
                // 返回触发可计算特性的图形提示
                var calculableShape = param.target;
                calculableShape.highlightStyle = calculableShape.highlightStyle || {};
                
                // 备份特出特性
                var highlightStyle = calculableShape.highlightStyle;
                var brushType = highlightStyle.brushTyep;
                var strokeColor = highlightStyle.strokeColor;
                var lineWidth = highlightStyle.lineWidth;
                
                highlightStyle.brushType = 'stroke';
                highlightStyle.strokeColor = self.ecTheme.calculableColor;
                highlightStyle.lineWidth = calculableShape.type == 'icon' ? 30 : 10;
                
                self.zr.addHoverShape(calculableShape);
                
                setTimeout(function (){
                    // 复位
                    if (calculableShape.highlightStyle) {
                        calculableShape.highlightStyle.brushType = brushType;
                        calculableShape.highlightStyle.strokeColor = strokeColor;
                        calculableShape.highlightStyle.lineWidth = lineWidth;
                    }
                },20);
            },
            
            ondrop : function (param) {
                // 排除一些非数据的拖拽进入
                if (typeof ecData.get(param.dragged, 'data') != 'undefined') {
                    self.isDrop = true;
                }
            },
            
            ondragend : function () {
                self.isDragend = true;
            }
        }
    }
    
    /**
     * 基类方法
     */
    Base.prototype = {
        /**
         * 图形拖拽特性 
         */
        setCalculable : function (shape) {
            shape.dragEnableTime = this.ecTheme.DRAG_ENABLE_TIME;
            shape.ondragover = this.shapeHandler.ondragover;
            shape.ondragend = this.shapeHandler.ondragend;
            shape.ondrop = this.shapeHandler.ondrop;
            return shape;
        },

        /**
         * 数据项被拖拽进来
         */
        ondrop : function (param, status) {
            if (!this.isDrop || !param.target) {
                // 没有在当前实例上发生拖拽行为则直接返回
                return;
            }

            var target = param.target;      // 拖拽安放目标
            var dragged = param.dragged;    // 当前被拖拽的图形对象

            var seriesIndex = ecData.get(target, 'seriesIndex');
            var dataIndex = ecData.get(target, 'dataIndex');

            // 落到数据item上，数据被拖拽到某个数据项上，数据修改
            var data = this.option.series[seriesIndex].data[dataIndex] || '-';
            if (data.value) {
                if (data.value != '-') {
                    this.option.series[seriesIndex].data[dataIndex].value = 
                        accMath.accAdd(
                            this.option.series[seriesIndex].data[dataIndex].value,
                            ecData.get(dragged, 'value')
                        );
                }
                else {
                    this.option.series[seriesIndex].data[dataIndex].value =
                        ecData.get(dragged, 'value');
                }
            }
            else {
                if (data != '-') {
                    this.option.series[seriesIndex].data[dataIndex] = 
                        accMath.accAdd(
                            this.option.series[seriesIndex].data[dataIndex],
                            ecData.get(dragged, 'value')
                        );
                }
                else {
                    this.option.series[seriesIndex].data[dataIndex] =
                        ecData.get(dragged, 'value');
                }
            }

            // 别status = {}赋值啊！！
            status.dragIn = status.dragIn || true;

            // 处理完拖拽事件后复位
            this.isDrop = false;

            return;
        },

        /**
         * 数据项被拖拽出去
         */
        ondragend : function (param, status) {
            if (!this.isDragend || !param.target) {
                // 没有在当前实例上发生拖拽行为则直接返回
                return;
            }
            var target = param.target;      // 被拖拽图形元素

            var seriesIndex = ecData.get(target, 'seriesIndex');
            var dataIndex = ecData.get(target, 'dataIndex');

            // 被拖拽的图形是折线图bar，删除被拖拽走的数据
            this.option.series[seriesIndex].data[dataIndex] = '-';

            // 别status = {}赋值啊！！
            status.dragOut = true;
            status.needRefresh = true;

            // 处理完拖拽事件后复位
            this.isDragend = false;

            return;
        },

        /**
         * 图例选择
         */
        onlegendSelected : function (param, status) {
            var legendSelected = param.selected;
            for (var itemName in this.selectedMap) {
                if (this.selectedMap[itemName] != legendSelected[itemName]) {
                    // 有一项不一致都需要重绘
                    status.needRefresh = true;
                }
                this.selectedMap[itemName] = legendSelected[itemName];
            }
            return;
        },
        
        /**
         * 添加文本 
         */
        addLabel : function (tarShape, serie, data, name, orient) {
            // 多级控制
            var queryTarget = [data, serie];
            var nLabel = this.deepMerge(queryTarget, 'itemStyle.normal.label');
            var eLabel = this.deepMerge(queryTarget, 'itemStyle.emphasis.label');

            var nTextStyle = nLabel.textStyle || {};
            var eTextStyle = eLabel.textStyle || {};
            
            if (nLabel.show) {
                tarShape.style.text = this._getLabelText(
                    serie, data, name, 'normal'
                );
                tarShape.style.textPosition = typeof nLabel.position == 'undefined'
                                              ? (orient == 'horizontal' ? 'right' : 'top')
                                              : nLabel.position;
                tarShape.style.textColor = nTextStyle.color;
                tarShape.style.textFont = this.getFont(nTextStyle);
            }
            if (eLabel.show) {
                tarShape.highlightStyle.text = this._getLabelText(
                    serie, data, name, 'emphasis'
                );
                tarShape.highlightStyle.textPosition = nLabel.show
                    ? tarShape.style.textPosition
                    : (typeof eLabel.position == 'undefined'
                        ? (orient == 'horizontal' ? 'right' : 'top')
                        : eLabel.position);
                tarShape.highlightStyle.textColor = eTextStyle.color;
                tarShape.highlightStyle.textFont = this.getFont(eTextStyle);
            }
            
            return tarShape;
        },
        
        /**
         * 根据lable.format计算label text
         */
        _getLabelText : function (serie, data, name, status) {
            var formatter = this.deepQuery(
                [data, serie],
                'itemStyle.' + status + '.label.formatter'
            );
            if (!formatter && status == 'emphasis') {
                // emphasis时需要看看normal下是否有formatter
                formatter = this.deepQuery(
                    [data, serie],
                    'itemStyle.normal.label.formatter'
                );
            }
            
            var value = typeof data != 'undefined'
                        ? (typeof data.value != 'undefined'
                          ? data.value
                          : data)
                        : '-';
            
            if (formatter) {
                if (typeof formatter == 'function') {
                    return formatter(
                        serie.name,
                        name,
                        value
                    );
                }
                else if (typeof formatter == 'string') {
                    formatter = formatter.replace('{a}','{a0}')
                                         .replace('{b}','{b0}')
                                         .replace('{c}','{c0}');
                    formatter = formatter.replace('{a0}', serie.name)
                                         .replace('{b0}', name)
                                         .replace('{c0}', value);
    
                    return formatter;
                }
            }
            else {
                return value;
            }
        },
        
        buildMark : function (serie, seriesIndex, component, markCoordParams, attachStyle) {
            if (this.selectedMap[serie.name]) {
                serie.markPoint && this._buildMarkPoint(
                    serie, seriesIndex, component, markCoordParams, attachStyle
                );
                serie.markLine && this._buildMarkLine(
                    serie, seriesIndex, component, markCoordParams, attachStyle
                );
            }
        },
        
        _buildMarkPoint : function (serie, seriesIndex, component, markCoordParams, attachStyle) {
            var _zlevelBase = this.getZlevelBase();
            var mpData;
            var pos;
            var markPoint = zrUtil.clone(serie.markPoint);
            for (var i = 0, l = markPoint.data.length; i < l; i++) {
                mpData = markPoint.data[i];
                pos = this.getMarkCoord(
                          serie, seriesIndex, mpData, markCoordParams
                      );
                markPoint.data[i].x = typeof mpData.x != 'undefined'
                                      ? mpData.x : pos[0];
                markPoint.data[i].y = typeof mpData.y != 'undefined'
                                      ? mpData.y : pos[1];
                if (mpData.type
                    && (mpData.type == 'max' || mpData.type == 'min')
                ) {
                    // 特殊值内置支持
                    markPoint.data[i].value = pos[3];
                    markPoint.data[i].name = mpData.name || mpData.type;
                    markPoint.data[i].symbolSize = markPoint.data[i].symbolSize
                        || (zrArea.getTextWidth(pos[3], this.getFont()) / 2 + 5);
                }
            }
            
            var shapeList = this._markPoint(serie, seriesIndex, markPoint, component);
            
            for (var i = 0, l = shapeList.length; i < l; i++) {
                shapeList[i].zlevel = _zlevelBase + 1;
                /*
                shapeList[i]._mark = 'point';
                shapeList[i]._x = shapeList[i].style.x 
                                  + shapeList[i].style.width / 2;
                shapeList[i]._y = shapeList[i].style.y 
                                  + shapeList[i].style.height / 2;
                */
                for (var key in attachStyle) {
                    shapeList[i][key] = zrUtil.clone(attachStyle[key]);
                }
                this.shapeList.push(shapeList[i]);
            }
            // 个别特殊图表需要自己addShape
            if (this.type == ecConfig.CHART_TYPE_FORCE
                || this.type == ecConfig.CHART_TYPE_CHORD
            ) {
                for (var i = 0, l = shapeList.length; i < l; i++) {
                    this.zr.addShape(shapeList[i]);
                }
            }
        },
        
        _buildMarkLine : function (serie, seriesIndex, component, markCoordParams, attachStyle) {
            var _zlevelBase = this.getZlevelBase();
            var mlData;
            var pos;
            var markLine = zrUtil.clone(serie.markLine);
            for (var i = 0, l = markLine.data.length; i < l; i++) {
                mlData = markLine.data[i];
                if (mlData.type
                    && (mlData.type == 'max' || mlData.type == 'min' || mlData.type == 'average')
                ) {
                    // 特殊值内置支持
                    pos = this.getMarkCoord(serie, seriesIndex, mlData, markCoordParams);
                    markLine.data[i] = [zrUtil.clone(mlData), {}];
                    markLine.data[i][0].name = mlData.name || mlData.type;
                    markLine.data[i][0].value = pos[3];
                    pos = pos[2];
                    mlData = [{},{}];
                }
                else {
                    pos = [
                        this.getMarkCoord(
                            serie, seriesIndex, mlData[0], markCoordParams
                        ),
                        this.getMarkCoord(
                            serie, seriesIndex, mlData[1], markCoordParams
                        )
                    ];
                }
                
                markLine.data[i][0].x = typeof mlData[0].x != 'undefined'
                                      ? mlData[0].x : pos[0][0];
                markLine.data[i][0].y = typeof mlData[0].y != 'undefined'
                                      ? mlData[0].y : pos[0][1];
                markLine.data[i][1].x = typeof mlData[1].x != 'undefined'
                                      ? mlData[1].x : pos[1][0];
                markLine.data[i][1].y = typeof mlData[1].y != 'undefined'
                                      ? mlData[1].y : pos[1][1];
            }
            
            var shapeList = this._markLine(
                serie, seriesIndex, markLine, component
            );
            
            for (var i = 0, l = shapeList.length; i < l; i++) {
                shapeList[i].zlevel = _zlevelBase + 1;
                for (var key in attachStyle) {
                    shapeList[i][key] = zrUtil.clone(attachStyle[key]);
                }
                this.shapeList.push(shapeList[i]);
            }
            // 个别特殊图表需要自己addShape
            if (this.type == ecConfig.CHART_TYPE_FORCE
                || this.type == ecConfig.CHART_TYPE_CHORD
            ) {
                for (var i = 0, l = shapeList.length; i < l; i++) {
                    this.zr.addShape(shapeList[i]);
                }
            }
        },
        
        _markPoint : function (serie, seriesIndex, mpOption, component) {
            zrUtil.merge(
                mpOption,
                this.ecTheme.markPoint
            );
            mpOption.name = serie.name;
                   
            var pList = [];
            var data = mpOption.data;
            var itemShape;
            
            var dataRange = component.dataRange;
            var legend = component.legend;
            var color;
            var value;
            var queryTarget;
            var nColor;
            var eColor;
            var effect;
            var zrWidth = this.zr.getWidth();
            var zrHeight = this.zr.getHeight();
            
            if (!mpOption.large) {
                for (var i = 0, l = data.length; i < l; i++) {
                    value = typeof data[i] != 'undefined' && typeof data[i].value != 'undefined'
                            ? data[i].value
                            : '';
                    // 图例
                    if (legend) {
                        color = legend.getColor(serie.name);
                    }
                    // 值域
                    if (dataRange) {
                        color = isNaN(value) ? color : dataRange.getColor(value);
                        
                        queryTarget = [data[i], mpOption];
                        nColor = this.deepQuery(
                            queryTarget, 'itemStyle.normal.color'
                        ) || color;
                        eColor = this.deepQuery(
                            queryTarget, 'itemStyle.emphasis.color'
                        ) || nColor;
                        // 有值域，并且值域返回null且用户没有自己定义颜色，则隐藏这个mark
                        if (nColor == null && eColor == null) {
                            continue;
                        }
                    }
                    
                    // 标准化一些参数
                    data[i].tooltip = data[i].tooltip 
                                      || {trigger:'item'}; // tooltip.trigger指定为item
                    data[i].name = typeof data[i].name != 'undefined'
                                   ? data[i].name : '';
                    data[i].value = value;
                    
                    // 复用getSymbolShape
                    itemShape = this.getSymbolShape(
                        mpOption, seriesIndex,      // 系列 
                        data[i], i, data[i].name,   // 数据
                        this.parsePercent(data[i].x, zrWidth),   // 坐标
                        this.parsePercent(data[i].y, zrHeight),  // 坐标
                        'pin', color,               // 默认symbol和color
                        'rgba(0,0,0,0)',
                        'horizontal'                // 走向，用于默认文字定位
                    );
                    itemShape._mark = 'point';
                    
                    effect = this.deepMerge(
                        [data[i], mpOption],
                        'effect'
                    );
                    if (effect.show) {
                        itemShape.effect = effect;
                    }
                    
                    if (serie.type == ecConfig.CHART_TYPE_MAP) {
                        itemShape._geo = this.getMarkGeo(data[i].name);
                    }
                    
                    // 重新pack一下数据
                    ecData.pack(
                        itemShape,
                        serie, seriesIndex,
                        data[i], 0,
                        data[i].name,
                        value
                    );
                    pList.push(itemShape);
                }
            }
            else {
                // 大规模MarkPoint
                itemShape = this.getLargeMarkPoingShape(serie, seriesIndex, mpOption, component);
                itemShape && pList.push(itemShape);
            }
            return pList;
        },
        
        _markLine : function (serie, seriesIndex, mlOption, component) {
            zrUtil.merge(
                mlOption,
                this.ecTheme.markLine
            );
            // 标准化一些同时支持Array和String的参数
            mlOption.symbol = mlOption.symbol instanceof Array
                      ? mlOption.symbol.length > 1 
                        ? mlOption.symbol 
                        : [mlOption.symbol[0], mlOption.symbol[0]]
                      : [mlOption.symbol, mlOption.symbol];
            mlOption.symbolSize = mlOption.symbolSize instanceof Array
                      ? mlOption.symbolSize.length > 1 
                        ? mlOption.symbolSize 
                        : [mlOption.symbolSize[0], mlOption.symbolSize[0]]
                      : [mlOption.symbolSize, mlOption.symbolSize];
            mlOption.symbolRotate = mlOption.symbolRotate instanceof Array
                      ? mlOption.symbolRotate.length > 1 
                        ? mlOption.symbolRotate 
                        : [mlOption.symbolRotate[0], mlOption.symbolRotate[0]]
                      : [mlOption.symbolRotate, mlOption.symbolRotate];
            
            mlOption.name = serie.name;
                   
            var pList = [];
            var data = mlOption.data;
            var itemShape;
            
            var dataRange = component.dataRange;
            var legend = component.legend;
            var color;
            var value;
            var queryTarget;
            var nColor;
            var eColor;
            var effect;
            var zrWidth = this.zr.getWidth();
            var zrHeight = this.zr.getHeight();
            var mergeData;
            for (var i = 0, l = data.length; i < l; i++) {
                // 图例
                if (legend) {
                    color = legend.getColor(serie.name);
                }
                // 组装一个mergeData
                mergeData = this.deepMerge(data[i]);
                value = typeof mergeData != 'undefined' && typeof mergeData.value != 'undefined'
                        ? mergeData.value
                        : '';
                // 值域
                if (dataRange) {
                    color = isNaN(value) ? color : dataRange.getColor(value);
                    
                    queryTarget = [mergeData, mlOption];
                    nColor = this.deepQuery(
                        queryTarget, 'itemStyle.normal.color'
                    ) || color;
                    eColor = this.deepQuery(
                        queryTarget, 'itemStyle.emphasis.color'
                    ) || nColor;
                    // 有值域，并且值域返回null且用户没有自己定义颜色，则隐藏这个mark
                    if (nColor == null && eColor == null) {
                        continue;
                    }
                }
                
                // 标准化一些参数
                data[i][0].tooltip = mergeData.tooltip 
                                     || {trigger:'item'}; // tooltip.trigger指定为item
                data[i][0].name = typeof data[i][0].name != 'undefined'
                                  ? data[i][0].name : '';
                data[i][1].name = typeof data[i][1].name != 'undefined'
                                  ? data[i][1].name : '';
                data[i][0].value = typeof data[i][0].value != 'undefined'
                                   ? data[i][0].value : '';
                
                itemShape = this.getLineMarkShape(
                    mlOption,                   // markLine
                    seriesIndex,
                    data[i],                    // 数据
                    i,
                    this.parsePercent(data[i][0].x, zrWidth),   // 坐标
                    this.parsePercent(data[i][0].y, zrHeight),  // 坐标
                    this.parsePercent(data[i][1].x, zrWidth),   // 坐标
                    this.parsePercent(data[i][1].y, zrHeight),  // 坐标
                    color                       // 默认symbol和color
                );
                
                effect = this.deepMerge(
                    [mergeData, mlOption],
                    'effect'
                );
                if (effect.show) {
                    itemShape.effect = effect;
                }
                
                if (serie.type == ecConfig.CHART_TYPE_MAP) {
                    itemShape._geo = [
                        this.getMarkGeo(data[i][0].name),
                        this.getMarkGeo(data[i][1].name)
                    ];
                }
                
                // 重新pack一下数据
                ecData.pack(
                    itemShape,
                    serie, seriesIndex,
                    data[i][0], 0,
                    data[i][0].name + (data[i][1].name !== '' 
                                      ? (' > ' + data[i][1].name) : ''),
                    value
                );
                pList.push(itemShape);
            }
            //console.log(pList);
            return pList;
        },
        
        getMarkCoord : function () {
            // 无转换位置
            return [0, 0];
        },
        
        getSymbolShape : function (
            serie, seriesIndex,     // 系列 
            data, dataIndex, name,  // 数据
            x, y,                   // 坐标
            symbol, color,          // 默认symbol和color，来自legend或dataRange全局分配
            emptyColor,             // 折线的emptySymbol用白色填充
            orient                  // 走向，用于默认文字定位
        ) {
            var queryTarget = [data, serie];
            var value = typeof data != 'undefined'
                        ? (typeof data.value != 'undefined'
                          ? data.value
                          : data)
                        : '-';
            
            symbol = this.deepQuery(queryTarget, 'symbol') || symbol;
            var symbolSize = this.deepQuery(queryTarget, 'symbolSize');
            symbolSize = typeof symbolSize == 'function'
                         ? symbolSize(value)
                         : symbolSize;
            var symbolRotate = this.deepQuery(queryTarget, 'symbolRotate');
            
            var normal = this.deepMerge(
                queryTarget,
                'itemStyle.normal'
            );
            var emphasis = this.deepMerge(
                queryTarget,
                'itemStyle.emphasis'
            );
            var nBorderWidth = typeof normal.borderWidth != 'undefined'
                       ? normal.borderWidth
                       : (normal.lineStyle && normal.lineStyle.width);
            if (typeof nBorderWidth == 'undefined') {
                nBorderWidth = symbol.match('empty') ? 2 : 0;
            }
            var eBorderWidth = typeof emphasis.borderWidth != 'undefined'
                       ? emphasis.borderWidth
                       : (emphasis.lineStyle && emphasis.lineStyle.width);
            if (typeof eBorderWidth == 'undefined') {
                eBorderWidth = nBorderWidth + 2;
            }
            
            var itemShape = new IconShape({
                style : {
                    iconType : symbol.replace('empty', '').toLowerCase(),
                    x : x - symbolSize,
                    y : y - symbolSize,
                    width : symbolSize * 2,
                    height : symbolSize * 2,
                    brushType : 'both',
                    color : symbol.match('empty') 
                            ? emptyColor 
                            : (this.getItemStyleColor(normal.color, seriesIndex, dataIndex, data)
                               || color),
                    strokeColor : normal.borderColor 
                              || this.getItemStyleColor(normal.color, seriesIndex, dataIndex, data)
                              || color,
                    lineWidth: nBorderWidth
                },
                highlightStyle : {
                    color : symbol.match('empty') 
                            ? emptyColor 
                            : this.getItemStyleColor(emphasis.color, seriesIndex, dataIndex, data),
                    strokeColor : emphasis.borderColor 
                              || normal.borderColor
                              || this.getItemStyleColor(normal.color, seriesIndex, dataIndex, data)
                              || color,
                    lineWidth: eBorderWidth
                },
                clickable : true
            });

            if (symbol.match('image')) {
                itemShape.style.image = 
                    symbol.replace(new RegExp('^image:\\/\\/'), '');
                itemShape = new ImageShape({
                    style : itemShape.style,
                    highlightStyle : itemShape.highlightStyle,
                    clickable : true
                });
            }
            
            if (typeof symbolRotate != 'undefined') {
                itemShape.rotation = [
                    symbolRotate * Math.PI / 180, x, y
                ];
            }
            
            if (symbol.match('star')) {
                itemShape.style.iconType = 'star';
                itemShape.style.n = 
                    (symbol.replace('empty', '').replace('star','') - 0) || 5;
            }
            
            if (symbol == 'none') {
                itemShape.invisible = true;
                itemShape.hoverable = false;
            }
            
            /*
            if (this.deepQuery([data, serie, option], 'calculable')) {
                this.setCalculable(itemShape);
                itemShape.draggable = true;
            }
            */

            itemShape = this.addLabel(
                itemShape, 
                serie, data, name, 
                orient
            );
            
            if (symbol.match('empty')) {
                if (typeof itemShape.style.textColor == 'undefined') {
                    itemShape.style.textColor = itemShape.style.strokeColor;
                }
                if (typeof itemShape.highlightStyle.textColor == 'undefined') {
                    itemShape.highlightStyle.textColor = 
                        itemShape.highlightStyle.strokeColor;
                }
            }
            
            ecData.pack(
                itemShape,
                serie, seriesIndex,
                data, dataIndex,
                name
            );

            // itemShape._mark = 'point'; // 复用animationMark
            itemShape._x = x;
            itemShape._y = y;
            
            itemShape._dataIndex = dataIndex;
            itemShape._seriesIndex = seriesIndex;

            return itemShape;
        },
        
        getLineMarkShape : function (
            mlOption,               // 系列 
            seriesIndex,            // 系列索引
            data,                   // 数据
            dataIndex,              // 数据索引
            xStart, yStart,         // 坐标
            xEnd, yEnd,             // 坐标
            color                   // 默认color，来自legend或dataRange全局分配
        ) {
            var value0 = typeof data[0] != 'undefined'
                        ? (typeof data[0].value != 'undefined'
                          ? data[0].value
                          : data[0])
                        : '-';
            var value1 = typeof data[1] != 'undefined'
                        ? (typeof data[1].value != 'undefined'
                          ? data[1].value
                          : data[1])
                        : '-';
            var symbol = [
                this.query(data[0], 'symbol') || mlOption.symbol[0],
                this.query(data[1], 'symbol') || mlOption.symbol[1]
            ];
            var symbolSize = [
                this.query(data[0], 'symbolSize') || mlOption.symbolSize[0],
                this.query(data[1], 'symbolSize') || mlOption.symbolSize[1]
            ];
            symbolSize[0] = typeof symbolSize[0] == 'function'
                            ? symbolSize[0](value0)
                            : symbolSize[0];
            symbolSize[1] = typeof symbolSize[1] == 'function'
                            ? symbolSize[1](value1)
                            : symbolSize[1];
            var symbolRotate = [
                this.query(data[0], 'symbolRotate') || mlOption.symbolRotate[0],
                this.query(data[1], 'symbolRotate') || mlOption.symbolRotate[1]
            ];
            //console.log(symbol, symbolSize, symbolRotate);
            
            var queryTarget = [data[0], mlOption];
            var normal = this.deepMerge(
                queryTarget,
                'itemStyle.normal'
            );
            normal.color = this.getItemStyleColor(normal.color, seriesIndex, dataIndex, data);
            var emphasis = this.deepMerge(
                queryTarget,
                'itemStyle.emphasis'
            );
            emphasis.color = this.getItemStyleColor(emphasis.color, seriesIndex, dataIndex, data);
            
            var nlineStyle = normal.lineStyle;
            var elineStyle = emphasis.lineStyle;
            
            var nBorderWidth = nlineStyle.width;
            if (typeof nBorderWidth == 'undefined') {
                nBorderWidth = normal.borderWidth;
            }
            var eBorderWidth = elineStyle.width;
            if (typeof eBorderWidth == 'undefined') {
                if (typeof emphasis.borderWidth != 'undefined') {
                    eBorderWidth = emphasis.borderWidth;
                }
                else {
                    eBorderWidth = nBorderWidth + 2;
                }
            }
            
            var itemShape = new MarkLineShape({
                style : {
                    smooth : mlOption.smooth ? 'spline' : false,
                    symbol : symbol, 
                    symbolSize : symbolSize,
                    symbolRotate : symbolRotate,
                    //data : [data[0].name,data[1].name],
                    xStart : xStart,
                    yStart : yStart,         // 坐标
                    xEnd : xEnd,
                    yEnd : yEnd,             // 坐标
                    brushType : 'both',
                    lineType : nlineStyle.type,
                    shadowColor : nlineStyle.shadowColor,
                    shadowBlur: nlineStyle.shadowBlur,
                    shadowOffsetX: nlineStyle.shadowOffsetX,
                    shadowOffsetY: nlineStyle.shadowOffsetY,
                    color : normal.color || color,
                    strokeColor : nlineStyle.color
                                  || normal.borderColor
                                  || normal.color
                                  || color,
                    lineWidth: nBorderWidth,
                    symbolBorderColor: normal.borderColor
                                       || normal.color
                                       || color,
                    symbolBorder: normal.borderWidth
                },
                highlightStyle : {
                    shadowColor : elineStyle.shadowColor,
                    shadowBlur: elineStyle.shadowBlur,
                    shadowOffsetX: elineStyle.shadowOffsetX,
                    shadowOffsetY: elineStyle.shadowOffsetY,
                    color : emphasis.color|| normal.color || color,
                    strokeColor : elineStyle.color
                                  || nlineStyle.color
                                  || emphasis.borderColor 
                                  || normal.borderColor
                                  || emphasis.color 
                                  || normal.color
                                  || color,
                    lineWidth: eBorderWidth,
                    symbolBorderColor: emphasis.borderColor
                                       || normal.borderColor
                                       || emphasis.color
                                       || normal.color
                                       || color,
                    symbolBorder: typeof emphasis.borderWidth == 'undefined'
                                  ? (normal.borderWidth + 2)
                                  : (emphasis.borderWidth)
                },
                clickable : true
            });
            
            itemShape = this.addLabel(
                itemShape, 
                mlOption, 
                data[0], 
                data[0].name + ' : ' + data[1].name
            );
            
           itemShape._mark = 'line';
           itemShape._x = xEnd;
           itemShape._y = yEnd;
            
            return itemShape;
        },
        
        getLargeMarkPoingShape : function(serie, seriesIndex, mpOption, component) {
            var data = mpOption.data;
            var itemShape;
            
            var dataRange = component.dataRange;
            var legend = component.legend;
            var color;
            var value;
            var queryTarget = [data[0], mpOption];
            var nColor;
            var eColor;
            var effect;
            
            // 图例
            if (legend) {
                color = legend.getColor(serie.name);
            }
            // 值域
            if (dataRange) {
                value = typeof data[0] != 'undefined'
                        ? (typeof data[0].value != 'undefined'
                          ? data[0].value
                          : data[0])
                        : '-';
                color = isNaN(value) ? color : dataRange.getColor(value);
                
                nColor = this.deepQuery(
                    queryTarget, 'itemStyle.normal.color'
                ) || color;
                eColor = this.deepQuery(
                    queryTarget, 'itemStyle.emphasis.color'
                ) || nColor;
                // 有值域，并且值域返回null且用户没有自己定义颜色，则隐藏这个mark
                if (nColor == null && eColor == null) {
                    return;
                }
            }
            color = this.deepMerge(queryTarget, 'itemStyle.normal').color 
                    || color;
            
            symbol = this.deepQuery(queryTarget, 'symbol') || 'circle';
            symbol = symbol.replace('empty', '').replace(/\d/g, '');
            
            var devicePixelRatio = window.devicePixelRatio || 1;
            
            //console.log(data)
            itemShape = new SymbolShape({
                style : {
                    pointList : data,
                    color : color,
                    strokeColor: color,
                    shadowColor : color,
                    shadowBlur : 8 * devicePixelRatio,
                    size : this.deepQuery(queryTarget, 'symbolSize'),
                    iconType : symbol,
                    brushType: 'fill',
                    lineWidth:1
                },
                draggable : false,
                hoverable : false
            });
            itemShape._mark = 'largePoint';
            
            effect = this.deepMerge(
                [data[0], mpOption],
                'effect'
            );
            if (effect.show) {
                itemShape.effect = effect;
            }
            
            return itemShape;
        },
        
        backupShapeList : function () {
            if (this.shapeList && this.shapeList.length > 0) {
                this.lastShapeList = this.shapeList;
                this.shapeList = [];
            }
            else {
                this.lastShapeList = [];
            }
        },
        
        addShapeList : function () {
            var maxLenth = this.option.animationThreshold / (this.canvasSupported ? 2 : 4);
            var lastShapeList = this.lastShapeList;
            var shapeList = this.shapeList;
            var duration = lastShapeList.length > 0
                           ? 500 : this.query(this.option, 'animationDuration');
            var easing = this.query(this.option, 'animationEasing');
            var key;
            var oldMap = {};
            var newMap = {};
            if (this.option.animation 
                && !this.option.renderAsImage 
                && shapeList.length < maxLenth
                && !this.motionlessOnce
            ) {
                // 通过已有的shape做动画过渡
                for (var i = 0, l = lastShapeList.length; i < l; i++) {
                    key = ecData.get(lastShapeList[i], 'seriesIndex') + '_'
                          + ecData.get(lastShapeList[i], 'dataIndex')
                          + (this.type == ecConfig.CHART_TYPE_RADAR
                             ? ecData.get(lastShapeList[i], 'special')
                             : '');
                    if (key.match('undefined') || lastShapeList[i]._mark) {
                        this.zr.delShape(lastShapeList[i].id); // 非关键元素直接删除
                    }
                    else {
                        key += lastShapeList[i].type;
                        oldMap[key] = lastShapeList[i];
                    }
                }
                for (var i = 0, l = shapeList.length; i < l; i++) {
                    key = ecData.get(shapeList[i], 'seriesIndex') + '_'
                          + ecData.get(shapeList[i], 'dataIndex')
                          + (this.type == ecConfig.CHART_TYPE_RADAR
                             ? ecData.get(shapeList[i], 'special')
                             : '');
                    if (key.match('undefined') || shapeList[i]._mark) {
                        this.zr.addShape(shapeList[i]); // 非关键元素直接添加
                    }
                    else {
                        key += shapeList[i].type;
                        newMap[key] = shapeList[i];
                    }
                }
                for (key in oldMap) {
                    if (!newMap[key]) {
                        // 新的没有 删除
                        this.zr.delShape(oldMap[key].id);
                    }
                }
                for (key in newMap) {
                    if (oldMap[key]) {
                        // 新旧都有 动画过渡
                        this.zr.delShape(oldMap[key].id);
                        this._animateMod(oldMap[key], newMap[key], duration, easing);
                    }
                    else {
                        // 新有旧没有  添加并动画过渡
                        this._animateAdd(newMap[key], duration, easing);
                    }
                }
                lastShapeList.length == 0 && this.animationMark(duration, easing);
            }
            else {
                this.motionlessOnce = false;
                // clear old
                this.zr.delShape(lastShapeList);
                // 直接添加
                for (var i = 0, l = shapeList.length; i < l; i++) {
                    this.zr.addShape(shapeList[i]);
                }
            }
        },
        
        _animateMod : function (oldShape, newShape, duration, easing) {
            switch (newShape.type) {
                case 'broken-line' :
                case 'half-smooth-polygon' :
                    animationBase.pointList(this.zr, oldShape, newShape, duration, easing);
                    break;
                case 'rectangle' :
                case 'icon' :
                    animationBase.rectangle(this.zr, oldShape, newShape, duration, easing);
                    break;
                case 'candle' :
                    if (duration > 500) {
                        animationBase.candle(this.zr, oldShape, newShape, duration, easing);
                    }
                    else {
                        this.zr.addShape(newShape);
                    }
                    break;
                case 'ring' :
                case 'sector' :
                case 'circle' :
                    if (duration > 500) {
                        animationBase.ring(
                            this.zr,
                            oldShape,
                            newShape, 
                            duration + ((ecData.get(newShape, 'dataIndex') || 0) % 20 * 100), 
                            easing
                        );
                    }
                    else if (newShape.type == 'sector') {
                        animationBase.sector(this.zr, oldShape, newShape, duration, easing);
                    }
                    else {
                        this.zr.addShape(newShape);
                    }
                    break;
                case 'text' :
                    animationBase.text(this.zr, oldShape, newShape, duration, easing);
                    break;
                case 'polygon' :
                    if (duration > 500) {
                        animationBase.polygon(this.zr, oldShape, newShape, duration, easing);
                    }
                    else {
                        animationBase.pointList(this.zr, oldShape, newShape, duration, easing);
                    }
                    break;
                case 'chord' :
                    animationBase.chord(this.zr, oldShape, newShape, duration, easing);
                    break;
                default :
                    this.zr.addShape(newShape);
                    break;
            }
        },
        
        _animateAdd : function (newShape, duration, easing) {
            switch (newShape.type) {
                case 'broken-line' :
                case 'half-smooth-polygon' :
                    var newPointList = [];
                    var len = newShape.style.pointList.length;
                    if (newShape._orient != 'vertical') {
                        var y = newShape.style.pointList[0][1];
                        for (var i = 0; i < len; i++) {
                            newPointList[i] = [newShape.style.pointList[i][0], y];
                        };
                    }
                    else {
                        var x = newShape.style.pointList[0][0];
                        for (var i = 0; i < len; i++) {
                            newPointList[i] = [x, newShape.style.pointList[i][1]];
                        };
                    }
                    if (newShape.type == 'half-smooth-polygon') {
                        newPointList[len - 1] = zrUtil.clone(newShape.style.pointList[len - 1]);
                        newPointList[len - 2] = zrUtil.clone(newShape.style.pointList[len - 2]);
                    }
                    this._animateMod(
                        {
                            style : { pointList : newPointList }
                        },
                        newShape,
                        duration,
                        easing
                    );
                    break;
                case 'rectangle' :
                case 'icon' :
                    this._animateMod(
                        {
                            style : {
                                x : newShape.style.x,
                                y : newShape._orient == 'vertical'
                                    ? newShape.style.y + newShape.style.height
                                    : newShape.style.y,
                                width: newShape._orient == 'vertical' 
                                       ? newShape.style.width : 0,
                                height: newShape._orient != 'vertical' 
                                       ? newShape.style.height : 0
                            }
                        },
                        newShape,
                        duration,
                        easing
                    );
                    break;
                case 'candle' :
                    var y = newShape.style.y;
                    this._animateMod(
                        {
                            style : {
                                y : [y[0], y[0], y[0], y[0]]
                            }
                        },
                        newShape,
                        duration,
                        easing
                    );
                    break;
                case 'sector' :
                    this._animateMod(
                        {
                            style : {
                                startAngle : newShape.style.startAngle,
                                endAngle : newShape.style.startAngle
                            }
                        },
                        newShape,
                        duration,
                        easing
                    );
                    break;
                case 'text' :
                    this._animateMod(
                        {
                            style : {
                                x : newShape.style.textAlign == 'left' 
                                    ? newShape.style.x + 100
                                    : newShape.style.x - 100,
                                y : newShape.style.y
                            }
                        },
                        newShape,
                        duration,
                        easing
                    );
                    break;
                case 'polygon' :
                    var rect = require('zrender/shape/Polygon').prototype.getRect(newShape.style);
                    var x = rect.x + rect.width / 2;
                    var y = rect.y + rect.height / 2;
                    var newPointList = [];
                    for (var i = 0, len = newShape.style.pointList.length; i < len; i++) {
                        newPointList.push([x + i, y + i]);
                    }
                    this._animateMod(
                        {
                            style : { pointList : newPointList }
                        },
                        newShape,
                        duration,
                        easing
                    );
                    break;
                case 'chord' :
                    this._animateMod(
                        {
                            style : {
                                source0 : 0,
                                source1 : 360,
                                target0 : 0,
                                target1 : 360
                            }
                        },
                        newShape,
                        duration,
                        easing
                    );
                    break;
                default :
                    this._animateMod({}, newShape, duration, easing);
                    break;
            }
        },
        
        animationMark : function (duration , easing) {
            var x;
            var y;
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                if (!this.shapeList[i]._mark) {
                    continue;
                }
                x = this.shapeList[i]._x || 0;
                y = this.shapeList[i]._y || 0;
                if (this.shapeList[i]._mark == 'point') {
                    this.zr.modShape(
                        this.shapeList[i].id, 
                        {
                            scale : [0, 0, x, y]
                        }
                    );
                    this.zr.animate(this.shapeList[i].id, '')
                        .when(
                            duration,
                            {scale : [1, 1, x, y]}
                        )
                        .start(easing || 'QuinticOut');
                }
                else if (this.shapeList[i]._mark == 'line') {
                    if (!this.shapeList[i].style.smooth) {
                        this.zr.modShape(
                            this.shapeList[i].id, 
                            {
                                style : {
                                    pointList : [
                                        [
                                            this.shapeList[i].style.xStart,
                                            this.shapeList[i].style.yStart
                                        ],
                                        [
                                            this.shapeList[i].style.xStart,
                                            this.shapeList[i].style.yStart
                                        ]
                                    ]
                                }
                            }
                        );
                        this.zr.animate(this.shapeList[i].id, 'style')
                            .when(
                                duration,
                                {
                                    pointList : [
                                        [
                                            this.shapeList[i].style.xStart,
                                            this.shapeList[i].style.yStart
                                        ],
                                        [
                                            x, y
                                        ]
                                    ]
                                }
                            )
                            .start(easing || 'QuinticOut');
                    }
                    else {
                        // 曲线动画
                        this.zr.modShape(
                            this.shapeList[i].id, 
                            {
                                style : {
                                    pointListLength : 1
                                }
                            }
                        );
                        this.zr.animate(this.shapeList[i].id, 'style')
                            .when(
                                duration,
                                {
                                    pointListLength : this.shapeList[i].style.pointList.length
                                }
                            )
                            .start(easing || 'QuinticOut');
                    }
                }
            }
            this.animationEffect();
        },

        animationEffect : function () {
            this.clearAnimationShape();
            var zlevel = EFFECT_ZLEVEL;
            if (this.canvasSupported) {
                this.zr.modLayer(
                    zlevel,
                    {
                        motionBlur : true,
                        lastFrameAlpha : 0.95
                    }
                );
            }
            
            var shape;
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                shape = this.shapeList[i];
                if (!(shape._mark && shape.effect && shape.effect.show && effectBase[shape._mark])
                ) {
                    continue;
                }
                //console.log(shape)
                effectBase[shape._mark](this.zr, this.effectList, shape, zlevel);
            }
        },
        
        clearAnimationShape : function (clearMotionBlur) {
            if (this.zr && this.effectList && this.effectList.length > 0) {
                clearMotionBlur && this.zr.modLayer(
                    EFFECT_ZLEVEL, 
                    { motionBlur : false}
                );
                this.zr.delShape(this.effectList);
            }
            this.effectList = [];
        }
    }

    return Base;
});