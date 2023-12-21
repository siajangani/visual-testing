/* eslint-disable @typescript-eslint/no-empty-function */
/*
James Cryer / Huddle
URL: https://github.com/Huddle/Resemble.js
*/

const naiveFallback = function () {
    // ISC (c) 2011-2019 https://github.com/medikoo/es5-ext/blob/master/global.js
    if (typeof self === 'object' && self) {
        return self
    }
    if (typeof window === 'object' && window) {
        return window
    }
    throw new Error('Unable to resolve global `this`')
}

const getGlobalThis = function () {
    // ISC (c) 2011-2019 https://github.com/medikoo/es5-ext/blob/master/global.js
    // Fallback to standard globalThis if available
    if (typeof globalThis === 'object' && globalThis) {
        return globalThis
    }

    try {
        Object.defineProperty(Object.prototype, '__global__', {
            get: function () {
                return this
            },
            configurable: true,
        })
    } catch (error) {
        return naiveFallback()
    }
    try {
    // eslint-disable-next-line no-undef
        if (!__global__) {
            return naiveFallback()
        }
        return __global__ // eslint-disable-line no-undef
    } finally {
        delete Object.prototype.__global__
    }
}

const isNode = function () {
    const globalPolyfill = getGlobalThis()
    return typeof globalPolyfill.process !== 'undefined' && globalPolyfill.process.versions && globalPolyfill.process.versions.node
};

(function (root, factory) {
    'use strict'
    if (typeof define === 'function' && define.amd) {
        define([], factory)
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory()
    } else {
        root.resemble = factory()
    }
})(this /* eslint-disable-line no-invalid-this*/, function () {
    'use strict'

    let Img
    let Canvas
    let loadNodeCanvasImage

    if (isNode()) {
        Canvas = require('canvas') // eslint-disable-line global-require
        Img = Canvas.Image
        loadNodeCanvasImage = Canvas.loadImage
    } else {
        Img = Image
    }

    function createCanvas(width, height) {
        if (isNode()) {
            return Canvas.createCanvas(width, height)
        }

        const cnvs = document.createElement('canvas')
        cnvs.width = width
        cnvs.height = height
        return cnvs
    }

    const oldGlobalSettings = {}
    let globalOutputSettings = oldGlobalSettings

    const resemble = function (fileData) {
        let pixelTransparency = 1

        const errorPixelColor = {
            // Color for Error Pixels. Between 0 and 255.
            red: 255,
            green: 0,
            blue: 255,
            alpha: 255,
        }

        const targetPix = { r: 0, g: 0, b: 0, a: 0 } // isAntialiased

        const errorPixelTransform = {
            flat: function (px, offset) {
                px[offset] = errorPixelColor.red
                px[offset + 1] = errorPixelColor.green
                px[offset + 2] = errorPixelColor.blue
                px[offset + 3] = errorPixelColor.alpha
            },
            movement: function (px, offset, d1, d2) {
                px[offset] = (d2.r * (errorPixelColor.red / 255) + errorPixelColor.red) / 2
                px[offset + 1] = (d2.g * (errorPixelColor.green / 255) + errorPixelColor.green) / 2
                px[offset + 2] = (d2.b * (errorPixelColor.blue / 255) + errorPixelColor.blue) / 2
                px[offset + 3] = d2.a
            },
            flatDifferenceIntensity: function (px, offset, d1, d2) {
                px[offset] = errorPixelColor.red
                px[offset + 1] = errorPixelColor.green
                px[offset + 2] = errorPixelColor.blue
                px[offset + 3] = colorsDistance(d1, d2)
            },
            movementDifferenceIntensity: function (px, offset, d1, d2) {
                const ratio = (colorsDistance(d1, d2) / 255) * 0.8

                px[offset] = (1 - ratio) * (d2.r * (errorPixelColor.red / 255)) + ratio * errorPixelColor.red
                px[offset + 1] = (1 - ratio) * (d2.g * (errorPixelColor.green / 255)) + ratio * errorPixelColor.green
                px[offset + 2] = (1 - ratio) * (d2.b * (errorPixelColor.blue / 255)) + ratio * errorPixelColor.blue
                px[offset + 3] = d2.a
            },
            diffOnly: function (px, offset, d1, d2) {
                px[offset] = d2.r
                px[offset + 1] = d2.g
                px[offset + 2] = d2.b
                px[offset + 3] = d2.a
            },
        }

        let errorPixel = errorPixelTransform.flat
        let errorType
        let boundingBoxes
        let ignoredBoxes
        let ignoreAreasColoredWith
        let largeImageThreshold = 1200
        let useCrossOrigin = true
        let data = {}
        let images = []
        const updateCallbackArray = []

        const tolerance = {
            // between 0 and 255
            red: 16,
            green: 16,
            blue: 16,
            alpha: 16,
            minBrightness: 16,
            maxBrightness: 240,
        }

        let ignoreAntialiasing = false
        let ignoreColors = false
        let scaleToSameSize = false
        let compareOnly = false
        let returnEarlyThreshold

        function colorsDistance(c1, c2) {
            return (Math.abs(c1.r - c2.r) + Math.abs(c1.g - c2.g) + Math.abs(c1.b - c2.b)) / 3
        }

        function withinBoundingBox(x, y, width, height, box) {
            return x > (box.left || 0) && x < (box.right || width) && y > (box.top || 0) && y < (box.bottom || height)
        }

        function withinComparedArea(x, y, width, height, pixel2) {
            let isIncluded = true
            let i
            let boundingBox
            let ignoredBox
            let selected
            let ignored

            if (boundingBoxes instanceof Array) {
                selected = false
                for (i = 0; i < boundingBoxes.length; i++) {
                    boundingBox = boundingBoxes[i]
                    if (withinBoundingBox(x, y, width, height, boundingBox)) {
                        selected = true
                        break
                    }
                }
            }
            if (ignoredBoxes instanceof Array) {
                ignored = true
                for (i = 0; i < ignoredBoxes.length; i++) {
                    ignoredBox = ignoredBoxes[i]
                    if (withinBoundingBox(x, y, width, height, ignoredBox)) {
                        ignored = false
                        break
                    }
                }
            }

            if (ignoreAreasColoredWith) {
                return colorsDistance(pixel2, ignoreAreasColoredWith) !== 0
            }

            if (selected === undefined && ignored === undefined) {
                return true
            }
            if (selected === false && ignored === true) {
                return false
            }
            if (selected === true || ignored === true) {
                isIncluded = true
            }
            if (selected === false || ignored === false) {
                isIncluded = false
            }
            return isIncluded
        }

        function triggerDataUpdate() {
            const len = updateCallbackArray.length
            let i
            for (i = 0; i < len; i++) {
                if (typeof updateCallbackArray[i] === 'function') {
                    updateCallbackArray[i](data)
                }
            }
        }

        function loop(w, h, callback) {
            let x
            let y

            for (x = 0; x < w; x++) {
                for (y = 0; y < h; y++) {
                    callback(x, y)
                }
            }
        }

        function parseImage(sourceImageData, width, height) {
            let pixelCount = 0
            let redTotal = 0
            let greenTotal = 0
            let blueTotal = 0
            let alphaTotal = 0
            let brightnessTotal = 0
            let whiteTotal = 0
            let blackTotal = 0

            loop(width, height, function (horizontalPos, verticalPos) {
                const offset = (verticalPos * width + horizontalPos) * 4
                const red = sourceImageData[offset]
                const green = sourceImageData[offset + 1]
                const blue = sourceImageData[offset + 2]
                const alpha = sourceImageData[offset + 3]
                const brightness = getBrightness(red, green, blue)

                if (red === green && red === blue && alpha) {
                    if (red === 0) {
                        blackTotal++
                    } else if (red === 255) {
                        whiteTotal++
                    }
                }

                pixelCount++

                redTotal += (red / 255) * 100
                greenTotal += (green / 255) * 100
                blueTotal += (blue / 255) * 100
                alphaTotal += ((255 - alpha) / 255) * 100
                brightnessTotal += (brightness / 255) * 100
            })

            data.red = Math.floor(redTotal / pixelCount)
            data.green = Math.floor(greenTotal / pixelCount)
            data.blue = Math.floor(blueTotal / pixelCount)
            data.alpha = Math.floor(alphaTotal / pixelCount)
            data.brightness = Math.floor(brightnessTotal / pixelCount)
            data.white = Math.floor((whiteTotal / pixelCount) * 100)
            data.black = Math.floor((blackTotal / pixelCount) * 100)

            triggerDataUpdate()
        }

        function onLoadImage(hiddenImage, callback) {
            // don't assign to hiddenImage, see https://github.com/Huddle/Resemble.js/pull/87/commits/300d43352a2845aad289b254bfbdc7cd6a37e2d7
            let width = hiddenImage.width
            let height = hiddenImage.height

            if (scaleToSameSize && images.length === 1) {
                width = images[0].width
                height = images[0].height
            }

            const hiddenCanvas = createCanvas(width, height)
            let imageData

            hiddenCanvas.getContext('2d').drawImage(hiddenImage, 0, 0, width, height)
            imageData = hiddenCanvas.getContext('2d').getImageData(0, 0, width, height)

            images.push(imageData)

            callback(imageData, width, height)
        }

        function loadImageData(fileDataForImage, callback) {
            let fileReader
            const hiddenImage = new Img()

            if (!hiddenImage.setAttribute) {
                hiddenImage.setAttribute = function setAttribute() {}
            }

            if (useCrossOrigin) {
                hiddenImage.setAttribute('crossorigin', 'anonymous')
            }

            hiddenImage.onerror = function (event) {
                hiddenImage.onload = null
                hiddenImage.onerror = null // fixes pollution between calls
                const error = event ? event + '' : 'Unknown error'
                images.push({ error: `Failed to load image '${fileDataForImage}'. ${error}` })
                callback()
            }

            hiddenImage.onload = function () {
                hiddenImage.onload = null // fixes pollution between calls
                hiddenImage.onerror = null
                onLoadImage(hiddenImage, callback)
            }

            if (typeof fileDataForImage === 'string') {
                hiddenImage.src = fileDataForImage
                if (!isNode() && hiddenImage.complete && hiddenImage.naturalWidth > 0) {
                    hiddenImage.onload()
                }
            } else if (
                typeof fileDataForImage.data !== 'undefined' &&
        typeof fileDataForImage.width === 'number' &&
        typeof fileDataForImage.height === 'number'
            ) {
                images.push(fileDataForImage)

                callback(fileDataForImage, fileDataForImage.width, fileDataForImage.height)
            } else if (typeof Buffer !== 'undefined' && fileDataForImage instanceof Buffer) {
                // If we have Buffer, assume we're on Node+Canvas and its supported
                // hiddenImage.src = fileDataForImage;

                loadNodeCanvasImage(fileDataForImage)
                    .then(function (image) {
                        hiddenImage.onload = null // fixes pollution between calls
                        hiddenImage.onerror = null
                        onLoadImage(image, callback)
                    })
                    .catch(function (err) {
                        images.push({
                            error: err ? err + '' : 'Image load error.',
                        })
                        callback()
                    })
            } else {
                fileReader = new FileReader()
                fileReader.onload = function (event) {
                    hiddenImage.src = event.target.result
                }
                fileReader.readAsDataURL(fileDataForImage)
            }
        }

        function isColorSimilar(a, b, color) {
            const absDiff = Math.abs(a - b)

            if (typeof a === 'undefined') {
                return false
            }
            if (typeof b === 'undefined') {
                return false
            }

            if (a === b) {
                return true
            } else if (absDiff < tolerance[color]) {
                return true
            }
            return false
        }

        function isPixelBrightnessSimilar(d1, d2) {
            const alpha = isColorSimilar(d1.a, d2.a, 'alpha')
            const brightness = isColorSimilar(d1.brightness, d2.brightness, 'minBrightness')
            return brightness && alpha
        }

        function getBrightness(r, g, b) {
            return 0.3 * r + 0.59 * g + 0.11 * b
        }

        function isRGBSame(d1, d2) {
            const red = d1.r === d2.r
            const green = d1.g === d2.g
            const blue = d1.b === d2.b
            return red && green && blue
        }

        function isRGBSimilar(d1, d2) {
            const red = isColorSimilar(d1.r, d2.r, 'red')
            const green = isColorSimilar(d1.g, d2.g, 'green')
            const blue = isColorSimilar(d1.b, d2.b, 'blue')
            const alpha = isColorSimilar(d1.a, d2.a, 'alpha')

            return red && green && blue && alpha
        }

        function isContrasting(d1, d2) {
            return Math.abs(d1.brightness - d2.brightness) > tolerance.maxBrightness
        }

        function getHue(red, green, blue) {
            const r = red / 255
            const g = green / 255
            const b = blue / 255
            const max = Math.max(r, g, b)
            const min = Math.min(r, g, b)
            let h
            let d

            if (max === min) {
                h = 0 // achromatic
            } else {
                d = max - min
                switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0)
                    break
                case g:
                    h = (b - r) / d + 2
                    break
                case b:
                    h = (r - g) / d + 4
                    break
                default:
                    h /= 6
                }
            }

            return h
        }

        function isAntialiased(sourcePix, pix, cacheSet, verticalPos, horizontalPos, width) {
            let offset
            const distance = 1
            let i
            let j
            let hasHighContrastSibling = 0
            let hasSiblingWithDifferentHue = 0
            let hasEquivalentSibling = 0

            addHueInfo(sourcePix)

            for (i = distance * -1; i <= distance; i++) {
                for (j = distance * -1; j <= distance; j++) {
                    if (i === 0 && j === 0) {
                        // ignore source pixel
                    } else {
                        offset = ((verticalPos + j) * width + (horizontalPos + i)) * 4

                        if (!getPixelInfo(targetPix, pix, offset, cacheSet)) {
                            continue
                        }

                        addBrightnessInfo(targetPix)
                        addHueInfo(targetPix)

                        if (isContrasting(sourcePix, targetPix)) {
                            hasHighContrastSibling++
                        }

                        if (isRGBSame(sourcePix, targetPix)) {
                            hasEquivalentSibling++
                        }

                        if (Math.abs(targetPix.h - sourcePix.h) > 0.3) {
                            hasSiblingWithDifferentHue++
                        }

                        if (hasSiblingWithDifferentHue > 1 || hasHighContrastSibling > 1) {
                            return true
                        }
                    }
                }
            }

            if (hasEquivalentSibling < 2) {
                return true
            }

            return false
        }

        function copyPixel(px, offset, pix) {
            if (errorType === 'diffOnly') {
                return
            }

            px[offset] = pix.r // r
            px[offset + 1] = pix.g // g
            px[offset + 2] = pix.b // b
            px[offset + 3] = pix.a * pixelTransparency // a
        }

        function copyGrayScalePixel(px, offset, pix) {
            if (errorType === 'diffOnly') {
                return
            }

            px[offset] = pix.brightness // r
            px[offset + 1] = pix.brightness // g
            px[offset + 2] = pix.brightness // b
            px[offset + 3] = pix.a * pixelTransparency // a
        }

        function getPixelInfo(dst, pix, offset) {
            if (pix.length > offset) {
                dst.r = pix[offset]
                dst.g = pix[offset + 1]
                dst.b = pix[offset + 2]
                dst.a = pix[offset + 3]

                return true
            }

            return false
        }

        function addBrightnessInfo(pix) {
            pix.brightness = getBrightness(pix.r, pix.g, pix.b) // 'corrected' lightness
        }

        function addHueInfo(pix) {
            pix.h = getHue(pix.r, pix.g, pix.b)
        }

        function analyseImages(img1, img2, width, height) {
            const data1 = img1.data
            const data2 = img2.data
            let hiddenCanvas
            let context
            let imgd
            let pix

            if (!compareOnly) {
                hiddenCanvas = createCanvas(width, height)

                context = hiddenCanvas.getContext('2d')
                imgd = context.createImageData(width, height)
                pix = imgd.data
            }

            let mismatchCount = 0
            const diffBounds = {
                top: height,
                left: width,
                bottom: 0,
                right: 0,
            }
            const updateBounds = function (x, y) {
                diffBounds.left = Math.min(x, diffBounds.left)
                diffBounds.right = Math.max(x, diffBounds.right)
                diffBounds.top = Math.min(y, diffBounds.top)
                diffBounds.bottom = Math.max(y, diffBounds.bottom)
            }

            const time = Date.now()

            let skip

            if (!!largeImageThreshold && ignoreAntialiasing && (width > largeImageThreshold || height > largeImageThreshold)) {
                skip = 6
            }

            const pixel1 = { r: 0, g: 0, b: 0, a: 0 }
            const pixel2 = { r: 0, g: 0, b: 0, a: 0 }

            let skipTheRest = false

            loop(width, height, function (horizontalPos, verticalPos) {
                if (skipTheRest) {
                    return
                }

                if (skip) {
                    // only skip if the image isn't small
                    if (verticalPos % skip === 0 || horizontalPos % skip === 0) {
                        return
                    }
                }

                const offset = (verticalPos * width + horizontalPos) * 4
                if (!getPixelInfo(pixel1, data1, offset, 1) || !getPixelInfo(pixel2, data2, offset, 2)) {
                    return
                }

                const isWithinComparedArea = withinComparedArea(horizontalPos, verticalPos, width, height, pixel2)

                if (ignoreColors) {
                    addBrightnessInfo(pixel1)
                    addBrightnessInfo(pixel2)

                    if (isPixelBrightnessSimilar(pixel1, pixel2) || !isWithinComparedArea) {
                        if (!compareOnly) {
                            copyGrayScalePixel(pix, offset, pixel2)
                        }
                    } else {
                        if (!compareOnly) {
                            errorPixel(pix, offset, pixel1, pixel2)
                        }

                        mismatchCount++
                        updateBounds(horizontalPos, verticalPos)
                    }
                    return
                }

                if (isRGBSimilar(pixel1, pixel2) || !isWithinComparedArea) {
                    if (!compareOnly) {
                        copyPixel(pix, offset, pixel1)
                    }
                } else if (
                    ignoreAntialiasing &&
          (addBrightnessInfo(pixel1), // jit pixel info augmentation looks a little weird, sorry.
          addBrightnessInfo(pixel2),
          isAntialiased(pixel1, data1, 1, verticalPos, horizontalPos, width) ||
            isAntialiased(pixel2, data2, 2, verticalPos, horizontalPos, width))
                ) {
                    if (isPixelBrightnessSimilar(pixel1, pixel2) || !isWithinComparedArea) {
                        if (!compareOnly) {
                            copyGrayScalePixel(pix, offset, pixel2)
                        }
                    } else {
                        if (!compareOnly) {
                            errorPixel(pix, offset, pixel1, pixel2)
                        }

                        mismatchCount++
                        updateBounds(horizontalPos, verticalPos)
                    }
                } else {
                    if (!compareOnly) {
                        errorPixel(pix, offset, pixel1, pixel2)
                    }

                    mismatchCount++
                    updateBounds(horizontalPos, verticalPos)
                }

                if (compareOnly) {
                    const currentMisMatchPercent = (mismatchCount / (height * width)) * 100

                    if (currentMisMatchPercent > returnEarlyThreshold) {
                        skipTheRest = true
                    }
                }
            })

            data.rawMisMatchPercentage = (mismatchCount / (height * width)) * 100
            data.misMatchPercentage = data.rawMisMatchPercentage.toFixed(2)

            data.diffBounds = diffBounds
            data.analysisTime = Date.now() - time

            data.getImageDataUrl = function (text) {
                if (compareOnly) {
                    throw Error('No diff image available - ran in compareOnly mode')
                }

                let barHeight = 0

                if (text) {
                    barHeight = addLabel(text, context, hiddenCanvas)
                }

                context.putImageData(imgd, 0, barHeight)

                return hiddenCanvas.toDataURL('image/png')
            }

            if (!compareOnly && hiddenCanvas.toBuffer) {
                data.getBuffer = function (includeOriginal) {
                    if (includeOriginal) {
                        const imageWidth = hiddenCanvas.width + 2
                        hiddenCanvas.width = imageWidth * 3
                        context.putImageData(img1, 0, 0)
                        context.putImageData(img2, imageWidth, 0)
                        context.putImageData(imgd, imageWidth * 2, 0)
                    } else {
                        context.putImageData(imgd, 0, 0)
                    }
                    return hiddenCanvas.toBuffer()
                }
            }
        }

        function addLabel(text, context, hiddenCanvas) {
            const textPadding = 2

            context.font = '12px sans-serif'

            const textWidth = context.measureText(text).width + textPadding * 2
            const barHeight = 22

            if (textWidth > hiddenCanvas.width) {
                hiddenCanvas.width = textWidth
            }

            hiddenCanvas.height += barHeight

            context.fillStyle = '#666'
            context.fillRect(0, 0, hiddenCanvas.width, barHeight - 4)
            context.fillStyle = '#fff'
            context.fillRect(0, barHeight - 4, hiddenCanvas.width, 4)

            context.fillStyle = '#fff'
            context.textBaseline = 'top'
            context.font = '12px sans-serif'
            context.fillText(text, textPadding, 1)

            return barHeight
        }

        function normalise(img, w, h) {
            let c
            let context

            if (img.height < h || img.width < w) {
                c = createCanvas(w, h)
                context = c.getContext('2d')
                context.putImageData(img, 0, 0)
                return context.getImageData(0, 0, w, h)
            }

            return img
        }

        function outputSettings(options) {
            let key

            if (options.errorColor) {
                for (key in options.errorColor) {
                    if (options.errorColor.hasOwnProperty(key)) {
                        errorPixelColor[key] = options.errorColor[key] === void 0 ? errorPixelColor[key] : options.errorColor[key]
                    }
                }
            }

            if (options.errorType && errorPixelTransform[options.errorType]) {
                errorPixel = errorPixelTransform[options.errorType]
                errorType = options.errorType
            }

            if (options.errorPixel && typeof options.errorPixel === 'function') {
                errorPixel = options.errorPixel
            }

            pixelTransparency = isNaN(Number(options.transparency)) ? pixelTransparency : options.transparency

            if (options.largeImageThreshold !== undefined) {
                largeImageThreshold = options.largeImageThreshold
            }

            if (options.useCrossOrigin !== undefined) {
                useCrossOrigin = options.useCrossOrigin
            }

            if (options.boundingBox !== undefined) {
                boundingBoxes = [options.boundingBox]
            }

            if (options.ignoredBox !== undefined) {
                ignoredBoxes = [options.ignoredBox]
            }

            if (options.boundingBoxes !== undefined) {
                boundingBoxes = options.boundingBoxes
            }

            if (options.ignoredBoxes !== undefined) {
                ignoredBoxes = options.ignoredBoxes
            }

            if (options.ignoreAreasColoredWith !== undefined) {
                ignoreAreasColoredWith = options.ignoreAreasColoredWith
            }
        }

        function compare(one, two) {
            if (globalOutputSettings !== oldGlobalSettings) {
                outputSettings(globalOutputSettings)
            }

            function onceWeHaveBoth() {
                let width
                let height
                if (images.length === 2) {
                    if (images[0].error || images[1].error) {
                        data = {}
                        data.error = images[0].error ? images[0].error : images[1].error
                        triggerDataUpdate()
                        return
                    }
                    width = images[0].width > images[1].width ? images[0].width : images[1].width
                    height = images[0].height > images[1].height ? images[0].height : images[1].height

                    data.isSameDimensions = images[0].width === images[1].width && images[0].height === images[1].height ? true : false

                    data.dimensionDifference = {
                        width: images[0].width - images[1].width,
                        height: images[0].height - images[1].height,
                    }

                    analyseImages(normalise(images[0], width, height), normalise(images[1], width, height), width, height)

                    triggerDataUpdate()
                }
            }

            images = []
            loadImageData(one, onceWeHaveBoth)
            loadImageData(two, onceWeHaveBoth)
        }

        function getCompareApi(param) {
            let secondFileData
            const hasMethod = typeof param === 'function'

            if (!hasMethod) {
                // assume it's file data
                secondFileData = param
            }

            var self = {
                setReturnEarlyThreshold: function (threshold) {
                    if (threshold) {
                        compareOnly = true
                        returnEarlyThreshold = threshold
                    }
                    return self
                },
                scaleToSameSize: function () {
                    scaleToSameSize = true

                    if (hasMethod) {
                        param()
                    }
                    return self
                },
                useOriginalSize: function () {
                    scaleToSameSize = false

                    if (hasMethod) {
                        param()
                    }
                    return self
                },
                ignoreNothing: function () {
                    tolerance.red = 0
                    tolerance.green = 0
                    tolerance.blue = 0
                    tolerance.alpha = 0
                    tolerance.minBrightness = 0
                    tolerance.maxBrightness = 255

                    ignoreAntialiasing = false
                    ignoreColors = false

                    if (hasMethod) {
                        param()
                    }
                    return self
                },
                ignoreLess: function () {
                    tolerance.red = 16
                    tolerance.green = 16
                    tolerance.blue = 16
                    tolerance.alpha = 16
                    tolerance.minBrightness = 16
                    tolerance.maxBrightness = 240

                    ignoreAntialiasing = false
                    ignoreColors = false

                    if (hasMethod) {
                        param()
                    }
                    return self
                },
                ignoreAntialiasing: function () {
                    tolerance.red = 32
                    tolerance.green = 32
                    tolerance.blue = 32
                    tolerance.alpha = 32
                    tolerance.minBrightness = 64
                    tolerance.maxBrightness = 96

                    ignoreAntialiasing = true
                    ignoreColors = false

                    if (hasMethod) {
                        param()
                    }
                    return self
                },
                ignoreColors: function () {
                    tolerance.alpha = 16
                    tolerance.minBrightness = 16
                    tolerance.maxBrightness = 240

                    ignoreAntialiasing = false
                    ignoreColors = true

                    if (hasMethod) {
                        param()
                    }
                    return self
                },
                ignoreAlpha: function () {
                    tolerance.red = 16
                    tolerance.green = 16
                    tolerance.blue = 16
                    tolerance.alpha = 255
                    tolerance.minBrightness = 16
                    tolerance.maxBrightness = 240

                    ignoreAntialiasing = false
                    ignoreColors = false

                    if (hasMethod) {
                        param()
                    }
                    return self
                },
                repaint: function () {
                    if (hasMethod) {
                        param()
                    }
                    return self
                },
                outputSettings: function (options) {
                    outputSettings(options)
                    return self
                },
                onComplete: function (callback) {
                    updateCallbackArray.push(callback)

                    const wrapper = function () {
                        compare(fileData, secondFileData)
                    }

                    wrapper()

                    return getCompareApi(wrapper)
                },
                setupCustomTolerance: function (customSettings) {
                    for (const property in tolerance) {
                        if (!customSettings.hasOwnProperty(property)) {
                            continue
                        }

                        tolerance[property] = customSettings[property]
                    }
                },
            }

            return self
        }

        var rootSelf = {
            onComplete: function (callback) {
                updateCallbackArray.push(callback)
                loadImageData(fileData, function (imageData, width, height) {
                    parseImage(imageData.data, width, height)
                })
            },
            compareTo: function (secondFileData) {
                return getCompareApi(secondFileData)
            },
            outputSettings: function (options) {
                outputSettings(options)
                return rootSelf
            },
        }

        return rootSelf
    }

    function setGlobalOutputSettings(settings) {
        globalOutputSettings = settings
        return resemble
    }

    function applyIgnore(api, ignore, customTolerance) {
        switch (ignore) {
        case 'nothing':
            api.ignoreNothing()
            break
        case 'less':
            api.ignoreLess()
            break
        case 'antialiasing':
            api.ignoreAntialiasing()
            break
        case 'colors':
            api.ignoreColors()
            break
        case 'alpha':
            api.ignoreAlpha()
            break
        default:
            throw new Error('Invalid ignore: ' + ignore)
        }

        api.setupCustomTolerance(customTolerance)
    }

    resemble.compare = function (image1, image2, options, cb) {
        let callback
        let opt

        if (typeof options === 'function') {
            callback = options
            opt = {}
        } else {
            callback = cb
            opt = options || {}
        }

        const res = resemble(image1)
        let compare

        if (opt.output) {
            res.outputSettings(opt.output)
        }

        compare = res.compareTo(image2)

        if (opt.returnEarlyThreshold) {
            compare.setReturnEarlyThreshold(opt.returnEarlyThreshold)
        }

        if (opt.scaleToSameSize) {
            compare.scaleToSameSize()
        }

        const toleranceSettings = opt.tolerance || {}
        if (typeof opt.ignore === 'string') {
            applyIgnore(compare, opt.ignore, toleranceSettings)
        } else if (opt.ignore && opt.ignore.forEach) {
            opt.ignore.forEach(function (v) {
                applyIgnore(compare, v, toleranceSettings)
            })
        }

        compare.onComplete(function (data) {
            if (data.error) {
                callback(data.error)
            } else {
                callback(null, data)
            }
        })
    }

    resemble.outputSettings = setGlobalOutputSettings
    return resemble
})
